import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { FridayDigestProps } from "../../../emails/FridayDigest";
import { EVENT_CATEGORIES, type EventCategory } from "../../events/types";
import { issueEmailToken } from "./tokens";
import { sendFridayDigest } from "./sender";
import {
  buildDigestEdition,
  selectDigestEvents,
  type DigestEdition,
  type DigestEventSnapshot,
  type DigestPreferences,
  type DigestSelection,
} from "./digest";

const SEND_LEASE_MINUTES = 15;
const UNSUBSCRIBE_TOKEN_DAYS = 395;

export interface DigestSubscriber {
  id: string;
  email: string;
  tokenVersion: number;
  userId: string | null;
  personalize: boolean;
}

export interface DeliveryClaim {
  deliveryId: string;
  deliveryKey: string;
  attempt: number;
  eventIds: string[];
  personalized: boolean;
}

export interface DigestRepository {
  getEdition(id: string): Promise<DigestEdition | null>;
  listInventory(now: Date): Promise<DigestEventSnapshot[]>;
  createEditionIfAbsent(edition: DigestEdition): Promise<DigestEdition>;
  listActiveSubscribers(): Promise<DigestSubscriber[]>;
  getPreferences(userId: string): Promise<DigestPreferences | null>;
  claimDelivery(input: {
    editionId: string;
    subscriberId: string;
    selection: DigestSelection;
    now: Date;
  }): Promise<DeliveryClaim | null>;
  markDeliverySent(input: {
    deliveryId: string;
    attempt: number;
    providerEmailId: string;
    now: Date;
  }): Promise<void>;
  markDeliveryFailed(input: {
    deliveryId: string;
    attempt: number;
    error: string;
    now: Date;
  }): Promise<void>;
}

export type DigestEmailProps = FridayDigestProps & {
  unsubscribePageUrl: string;
  oneClickUnsubscribeUrl: string;
};

export type DigestSender = (input: {
  email: string;
  props: DigestEmailProps;
  deliveryKey: string;
}) => Promise<string>;

export interface DigestRunSummary {
  editionId: string;
  editionStatus: DigestEdition["status"];
  holdReason: DigestEdition["holdReason"];
  dryRun: boolean;
  subscribers: number;
  sent: number;
  failed: number;
  skipped: number;
  personalized: number;
  generic: number;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (
    value && typeof value === "object" && "toDate" in value
    && typeof value.toDate === "function"
  ) return value.toDate();
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function category(value: unknown): EventCategory {
  return typeof value === "string" && EVENT_CATEGORIES.includes(value as EventCategory)
    ? value as EventCategory
    : "Community";
}

function eventFromDocument(id: string, data: FirebaseFirestore.DocumentData): DigestEventSnapshot | null {
  const date = toDate(data.date);
  const lastVerifiedAt = toDate(data.lastVerifiedAt) ?? new Date(0);
  if (!date || typeof data.title !== "string" || typeof data.sourceUrl !== "string") {
    return null;
  }
  const cost = data.cost && typeof data.cost === "object"
    ? data.cost as Record<string, unknown>
    : null;
  const ageRange = data.ageRange && typeof data.ageRange === "object"
    ? data.ageRange as Record<string, unknown>
    : null;
  const costAmount = finiteNumber(data.costAmount) ?? finiteNumber(cost?.amount);
  return {
    id,
    title: data.title,
    date: date.toISOString(),
    endDate: toDate(data.endDate)?.toISOString() ?? null,
    location: typeof data.location === "string" ? data.location : "",
    town: typeof data.town === "string" ? data.town : "Westfield",
    category: category(data.category),
    status: data.status === "cancelled" || data.status === "postponed" || data.status === "rescheduled"
      ? data.status
      : "scheduled",
    availability: data.availability === "available"
      || data.availability === "registration-required"
      || data.availability === "waitlist"
      || data.availability === "sold-out"
      ? data.availability
      : "unknown",
    sourceUrl: data.sourceUrl,
    publicationStatus: "published",
    freshnessStatus: data.freshnessStatus === "missing" || data.freshnessStatus === "stale"
      ? data.freshnessStatus
      : "current",
    lastVerifiedAt: lastVerifiedAt.toISOString(),
    minAge: finiteNumber(data.minAge) ?? finiteNumber(ageRange?.min),
    maxAge: finiteNumber(data.maxAge) ?? finiteNumber(ageRange?.max),
    costAmount,
    isFree: typeof data.isFree === "boolean"
      ? data.isFree
      : cost?.type === "free"
        ? true
        : costAmount == null ? null : costAmount === 0,
    environment: data.environment === "indoor" || data.environment === "outdoor"
      ? data.environment
      : null,
    driveMinutes: finiteNumber(data.driveMinutes),
  };
}

function editionFromDocument(id: string, data: FirebaseFirestore.DocumentData): DigestEdition | null {
  if (!Array.isArray(data.candidateEvents) || !Array.isArray(data.genericEventIds)) return null;
  if (data.status !== "ready" && data.status !== "held") return null;
  return {
    id,
    status: data.status,
    holdReason: data.holdReason === "empty-inventory" || data.holdReason === "stale-inventory"
      ? data.holdReason
      : null,
    issueLabel: String(data.issueLabel ?? id),
    intro: String(data.intro ?? "Fresh events around Westfield."),
    createdAt: String(data.createdAtIso ?? toDate(data.createdAt)?.toISOString() ?? ""),
    inventoryCutoff: String(data.inventoryCutoff ?? ""),
    genericEventIds: stringList(data.genericEventIds),
    candidateEvents: data.candidateEvents as DigestEventSnapshot[],
  };
}

function preferencesFromDocument(data: FirebaseFirestore.DocumentData): DigestPreferences | null {
  const stored = data.preferences;
  if (!stored || typeof stored !== "object") return null;
  const values = stored as Record<string, unknown>;
  return {
    towns: stringList(values.towns),
    driveMinutes: finiteNumber(values.driveMinutes),
    childAges: Array.isArray(values.childAges)
      ? values.childAges.filter((age): age is number => typeof age === "number" && Number.isFinite(age))
      : [],
    interests: stringList(values.interests).map(category),
    indoorPreference: values.indoorPreference === "indoor" || values.indoorPreference === "outdoor"
      ? values.indoorPreference
      : "either",
    budgetMax: finiteNumber(values.budgetMax),
    personalizeFriday: values.personalizeFriday === true,
  };
}

function deliveryDocumentId(editionId: string, subscriberId: string): string {
  return `${editionId}_${subscriberId}`;
}

export function activeSubscriberFromDocument(
  id: string,
  data: FirebaseFirestore.DocumentData
): DigestSubscriber | null {
  if (data.status !== "active" || typeof data.email !== "string" || !data.email) return null;
  if (
    data.suppressed === true
    || data.suppressedAt != null
    || data.emailSuppressedAt != null
    || data.emailStatus === "suppressed"
    || data.emailStatus === "bounced"
    || data.emailStatus === "complained"
  ) return null;
  return {
    id,
    email: data.email,
    tokenVersion: Number.isSafeInteger(data.tokenVersion) ? data.tokenVersion : 1,
    userId: typeof data.userId === "string" && data.userId ? data.userId : null,
    personalize: data.personalize === true,
  };
}

export function createFirestoreDigestRepository(db: Firestore): DigestRepository {
  return {
    async getEdition(id) {
      const snapshot = await db.collection("digestEditions").doc(id).get();
      return snapshot.exists ? editionFromDocument(snapshot.id, snapshot.data() ?? {}) : null;
    },

    async listInventory(now) {
      const windowEnd = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
      const snapshot = await db.collection("events")
        .where("publicationStatus", "==", "published")
        .where("date", ">=", Timestamp.fromDate(now))
        .where("date", "<=", Timestamp.fromDate(windowEnd))
        .orderBy("date", "asc")
        .limit(250)
        .get();
      return snapshot.docs
        .map((document) => eventFromDocument(document.id, document.data()))
        .filter((event): event is DigestEventSnapshot => event !== null);
    },

    async createEditionIfAbsent(edition) {
      const ref = db.collection("digestEditions").doc(edition.id);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (snapshot.exists) {
          const existing = editionFromDocument(snapshot.id, snapshot.data() ?? {});
          if (!existing) throw new Error("INVALID_DIGEST_EDITION");
          return existing;
        }
        transaction.create(ref, {
          ...edition,
          createdAt: Timestamp.fromDate(new Date(edition.createdAt)),
          createdAtIso: edition.createdAt,
        });
        return edition;
      });
    },

    async listActiveSubscribers() {
      const snapshot = await db.collection("subscribers").where("status", "==", "active").get();
      return snapshot.docs.flatMap((document) => {
        const subscriber = activeSubscriberFromDocument(document.id, document.data());
        return subscriber ? [subscriber] : [];
      });
    },

    async getPreferences(userId) {
      const snapshot = await db.collection("users").doc(userId).get();
      return snapshot.exists ? preferencesFromDocument(snapshot.data() ?? {}) : null;
    },

    async claimDelivery({ editionId, subscriberId, selection, now }) {
      const deliveryId = deliveryDocumentId(editionId, subscriberId);
      const deliveryKey = `friday-digest/${editionId}/${subscriberId}`;
      const ref = db.collection("digestDeliveries").doc(deliveryId);
      const subscriberRef = db.collection("subscribers").doc(subscriberId);
      return db.runTransaction(async (transaction) => {
        const subscriberSnapshot = await transaction.get(subscriberRef);
        if (!subscriberSnapshot.exists || !activeSubscriberFromDocument(
          subscriberSnapshot.id,
          subscriberSnapshot.data() ?? {}
        )) return null;
        const snapshot = await transaction.get(ref);
        if (snapshot.exists) {
          const data = snapshot.data() ?? {};
          const status = String(data.status ?? "");
          const leaseUntil = toDate(data.leaseUntil);
          const retryable = status === "failed"
            || status === "queued"
            || (status === "sending" && (!leaseUntil || leaseUntil.getTime() <= now.getTime()));
          if (!retryable) return null;
          const attempt = Number(data.attempt ?? 1) + 1;
          const eventIds = stringList(data.eventIds);
          transaction.update(ref, {
            status: "sending",
            attempt,
            sendStartedAt: Timestamp.fromDate(now),
            leaseUntil: Timestamp.fromDate(new Date(now.getTime() + SEND_LEASE_MINUTES * 60 * 1000)),
            lastError: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          return {
            deliveryId,
            deliveryKey: typeof data.deliveryKey === "string" ? data.deliveryKey : deliveryKey,
            attempt,
            eventIds: eventIds.length > 0 ? eventIds : selection.eventIds,
            personalized: data.personalized === true,
          };
        }

        transaction.create(ref, {
          editionId,
          subscriberId,
          deliveryKey,
          status: "sending",
          attempt: 1,
          eventIds: selection.eventIds,
          personalized: selection.personalized,
          sendStartedAt: Timestamp.fromDate(now),
          leaseUntil: Timestamp.fromDate(new Date(now.getTime() + SEND_LEASE_MINUTES * 60 * 1000)),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return {
          deliveryId,
          deliveryKey,
          attempt: 1,
          eventIds: selection.eventIds,
          personalized: selection.personalized,
        };
      });
    },

    async markDeliverySent({ deliveryId, attempt, providerEmailId, now }) {
      const ref = db.collection("digestDeliveries").doc(deliveryId);
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists || snapshot.data()?.attempt !== attempt) return;
        transaction.update(ref, {
          status: "sent",
          providerEmailId,
          sentAt: Timestamp.fromDate(now),
          leaseUntil: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
    },

    async markDeliveryFailed({ deliveryId, attempt, error, now }) {
      const ref = db.collection("digestDeliveries").doc(deliveryId);
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists || snapshot.data()?.attempt !== attempt) return;
        transaction.update(ref, {
          status: "failed",
          failedAt: Timestamp.fromDate(now),
          lastError: error.slice(0, 500),
          leaseUntil: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
    },
  };
}

function statusLabel(event: DigestEventSnapshot): string | undefined {
  if (event.status === "rescheduled") return "Rescheduled";
  if (event.availability === "sold-out") return "Sold out";
  if (event.availability === "waitlist") return "Waitlist";
  if (event.availability === "registration-required") return "Registration required";
  return undefined;
}

function emailProps(input: {
  edition: DigestEdition;
  eventIds: string[];
  personalized: boolean;
  unsubscribePageUrl: string;
  oneClickUnsubscribeUrl: string;
  siteOrigin: string;
}): DigestEmailProps {
  const byId = new Map(input.edition.candidateEvents.map((event) => [event.id, event]));
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const props = {
    issueLabel: input.edition.issueLabel,
    intro: input.edition.intro,
    personalized: input.personalized,
    calendarUrl: new URL("/events", input.siteOrigin).toString(),
    unsubscribePageUrl: input.unsubscribePageUrl,
    oneClickUnsubscribeUrl: input.oneClickUnsubscribeUrl,
    // Local compatibility for the pre-review template. The integrated template
    // reads the two purpose-specific fields above.
    unsubscribeUrl: input.unsubscribePageUrl,
    events: input.eventIds.flatMap((id) => {
      const event = byId.get(id);
      if (!event) return [];
      return [{
        id: event.id,
        title: event.title,
        when: formatter.format(new Date(event.date)),
        location: event.location,
        town: event.town,
        url: event.sourceUrl,
        statusLabel: statusLabel(event),
      }];
    }),
  };
  return props;
}

async function editionForRun(input: {
  repository: DigestRepository;
  now: Date;
  editionId?: string;
  dryRun: boolean;
}): Promise<DigestEdition> {
  const candidate = buildDigestEdition({
    events: [],
    now: input.now,
    id: input.editionId,
  });
  const existing = await input.repository.getEdition(candidate.id);
  if (existing) return existing;
  const events = await input.repository.listInventory(input.now);
  const edition = buildDigestEdition({ events, now: input.now, id: candidate.id });
  return input.dryRun ? edition : input.repository.createEditionIfAbsent(edition);
}

export async function runFridayDigest(input: {
  repository: DigestRepository;
  siteOrigin: string;
  tokenSecret: string;
  sender?: DigestSender;
  now?: Date;
  editionId?: string;
  dryRun?: boolean;
}): Promise<DigestRunSummary> {
  const now = input.now ?? new Date();
  const dryRun = input.dryRun === true;
  const edition = await editionForRun({
    repository: input.repository,
    now,
    editionId: input.editionId,
    dryRun,
  });
  const summary: DigestRunSummary = {
    editionId: edition.id,
    editionStatus: edition.status,
    holdReason: edition.holdReason,
    dryRun,
    subscribers: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    personalized: 0,
    generic: 0,
  };
  if (edition.status === "held") return summary;

  const subscribers = await input.repository.listActiveSubscribers();
  summary.subscribers = subscribers.length;
  const sender = input.sender ?? sendFridayDigest;

  await Promise.all(subscribers.map(async (subscriber) => {
    const preferences = subscriber.personalize && subscriber.userId
      ? await input.repository.getPreferences(subscriber.userId)
      : null;
    const selection = selectDigestEvents(edition, preferences, subscriber.personalize);
    if (selection.personalized) summary.personalized += 1;
    else summary.generic += 1;
    if (dryRun) return;

    const claim = await input.repository.claimDelivery({
      editionId: edition.id,
      subscriberId: subscriber.id,
      selection,
      now,
    });
    if (!claim) {
      summary.skipped += 1;
      return;
    }
    const token = issueEmailToken({
      subscriberId: subscriber.id,
      purpose: "unsubscribe",
      version: subscriber.tokenVersion,
      expiresAt: new Date(now.getTime() + UNSUBSCRIBE_TOKEN_DAYS * 24 * 60 * 60 * 1000),
      secret: input.tokenSecret,
    });
    const unsubscribePageUrl = new URL("/unsubscribe", input.siteOrigin);
    unsubscribePageUrl.searchParams.set("token", token);
    const oneClickUnsubscribeUrl = new URL("/api/subscriptions/unsubscribe", input.siteOrigin);
    oneClickUnsubscribeUrl.searchParams.set("token", token);

    try {
      const providerEmailId = await sender({
        email: subscriber.email,
        deliveryKey: claim.deliveryKey,
        props: emailProps({
          edition,
          eventIds: claim.eventIds,
          personalized: claim.personalized,
          unsubscribePageUrl: unsubscribePageUrl.toString(),
          oneClickUnsubscribeUrl: oneClickUnsubscribeUrl.toString(),
          siteOrigin: input.siteOrigin,
        }),
      });
      await input.repository.markDeliverySent({
        deliveryId: claim.deliveryId,
        attempt: claim.attempt,
        providerEmailId,
        now,
      });
      summary.sent += 1;
    } catch (error) {
      await input.repository.markDeliveryFailed({
        deliveryId: claim.deliveryId,
        attempt: claim.attempt,
        error: error instanceof Error ? error.message : "Unknown email delivery error",
        now,
      });
      summary.failed += 1;
    }
  }));

  return summary;
}
