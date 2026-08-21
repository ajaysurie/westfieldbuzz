import { FieldPath, FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import type { FridayDigestProps } from "../../../emails/FridayDigest";
import { normalizeCategory } from "../../events/normalize";
import type { EventCategory } from "../../events/types";
import { issueEmailToken } from "./tokens";
import { EmailProviderTimeoutError, sendFridayDigest } from "./sender";
import type { DeliveryStatus } from "./webhooks";
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
  subscriberEmail: string;
  tokenVersion: number;
  unsubscribeExpiresAt: Date;
}

export interface DigestRepository {
  getEdition(id: string): Promise<DigestEdition | null>;
  listInventory(now: Date): Promise<DigestEventSnapshot[]>;
  createEditionIfAbsent(edition: DigestEdition): Promise<DigestEdition>;
  listActiveSubscribers(): Promise<DigestSubscriber[]>;
  listActiveSubscribersPage?(input: { afterId?: string; limit: number }): Promise<{
    subscribers: DigestSubscriber[];
    nextCursor: string | null;
  }>;
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
  /** Re-check consent immediately before crossing the provider boundary. */
  authorizeDelivery?(input: { subscriberId: string; deliveryId: string; attempt: number }): Promise<boolean>;
  startRun?(input: { runId: string; editionId: string; cursor: string | null; now: Date }): Promise<void>;
  finishRun?(input: { runId: string; status: "success" | "partial" | "failed"; nextCursor: string | null; summary: DigestRunSummary; now: Date }): Promise<void>;
}

export type DigestEmailProps = FridayDigestProps & {
  unsubscribePageUrl: string;
  oneClickUnsubscribeUrl: string;
};

export type DigestSender = (input: {
  email: string;
  props: DigestEmailProps;
  deliveryKey: string;
  deliveryId: string;
}) => Promise<string>;

export interface DigestRunSummary {
  runId?: string;
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
  status?: "success" | "partial" | "failed";
  nextCursor?: string | null;
}

const DIGEST_PAGE_SIZE = 100;
const DIGEST_DEADLINE_RESERVE_MS = 2_000;

function mayStartDigestWork(deadlineAt: Date | undefined): boolean {
  return !deadlineAt || Date.now() + DIGEST_DEADLINE_RESERVE_MS < deadlineAt.getTime();
}

export function deliveryStatusAfterAcceptance(
  current: DeliveryStatus,
  failureOrigin: unknown
): DeliveryStatus {
  // A local failure is retryable. Once the identical provider request later
  // accepts, it must become sent. Provider lifecycle events are authoritative
  // and may have reached a later state before this callback returns.
  if (
    current === "delayed"
    || current === "delivered"
    || current === "bounced"
    || current === "complained"
    || current === "suppressed"
    || (current === "failed" && failureOrigin === "provider")
  ) return current;
  return "sent";
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
  return normalizeCategory(typeof value === "string" ? value : undefined);
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
    status: data.status === "cancelled" || data.status === "postponed"
      || data.status === "rescheduled" || data.status === "weather-dependent"
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
          if (existing.status === "held" && edition.status === "ready") {
            transaction.set(ref, {
              ...edition,
              createdAt: Timestamp.fromDate(new Date(edition.createdAt)),
              createdAtIso: edition.createdAt,
              refreshedAt: FieldValue.serverTimestamp(),
            });
            return edition;
          }
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

    async listActiveSubscribersPage({ afterId, limit }) {
      let subscriberQuery = db.collection("subscribers")
        .where("status", "==", "active")
        .orderBy(FieldPath.documentId())
        .limit(Math.max(1, Math.min(limit, DIGEST_PAGE_SIZE)));
      if (afterId) subscriberQuery = subscriberQuery.startAfter(afterId);
      const snapshot = await subscriberQuery.get();
      const pageSize = Math.max(1, Math.min(limit, DIGEST_PAGE_SIZE));
      return {
        subscribers: snapshot.docs.flatMap((document) => {
          const subscriber = activeSubscriberFromDocument(document.id, document.data());
          return subscriber ? [subscriber] : [];
        }),
        nextCursor: snapshot.size === pageSize ? snapshot.docs.at(-1)?.id ?? null : null,
      };
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
        const activeSubscriber = subscriberSnapshot.exists
          ? activeSubscriberFromDocument(subscriberSnapshot.id, subscriberSnapshot.data() ?? {})
          : null;
        if (!activeSubscriber) return null;
        const snapshot = await transaction.get(ref);
        if (snapshot.exists) {
          const data = snapshot.data() ?? {};
          const status = String(data.status ?? "");
          const leaseUntil = toDate(data.leaseUntil);
          const retryable = (status === "failed" && data.failureOrigin !== "provider")
            || status === "queued"
            || (status === "sending" && (!leaseUntil || leaseUntil.getTime() <= now.getTime()));
          if (!retryable) return null;
          const tokenVersion = Number(data.tokenVersion ?? activeSubscriber.tokenVersion);
          if (tokenVersion !== activeSubscriber.tokenVersion) return null;
          const attempt = Number(data.attempt ?? 1) + 1;
          const eventIds = stringList(data.eventIds);
          const unsubscribeExpiresAt = toDate(data.unsubscribeExpiresAt)
            ?? new Date(now.getTime() + UNSUBSCRIBE_TOKEN_DAYS * 24 * 60 * 60 * 1000);
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
            subscriberEmail: typeof data.subscriberEmail === "string"
              ? data.subscriberEmail
              : activeSubscriber.email,
            tokenVersion,
            unsubscribeExpiresAt,
          };
        }

        const unsubscribeExpiresAt = new Date(
          now.getTime() + UNSUBSCRIBE_TOKEN_DAYS * 24 * 60 * 60 * 1000
        );
        transaction.create(ref, {
          editionId,
          subscriberId,
          deliveryKey,
          status: "sending",
          attempt: 1,
          eventIds: selection.eventIds,
          personalized: selection.personalized,
          subscriberEmail: activeSubscriber.email,
          tokenVersion: activeSubscriber.tokenVersion,
          unsubscribeExpiresAt: Timestamp.fromDate(unsubscribeExpiresAt),
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
          subscriberEmail: activeSubscriber.email,
          tokenVersion: activeSubscriber.tokenVersion,
          unsubscribeExpiresAt,
        };
      });
    },

    async markDeliverySent({ deliveryId, attempt, providerEmailId, now }) {
      const ref = db.collection("digestDeliveries").doc(deliveryId);
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists || snapshot.data()?.attempt !== attempt) return;
        const data = snapshot.data() ?? {};
        const current = (data.status ?? "sending") as DeliveryStatus;
        transaction.update(ref, {
          // A webhook can arrive before Resend's send call resolves. Keep the
          // provider's more-complete state while still recording acceptance.
          status: deliveryStatusAfterAcceptance(current, data.failureOrigin),
          providerEmailId,
          acceptedAt: Timestamp.fromDate(now),
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
        const data = snapshot.data() ?? {};
        // Provider webhooks can arrive before the send request reports a local
        // failure. Only the current sending attempt is locally retryable.
        if (data.status !== "sending") return;
        transaction.update(ref, {
          status: "failed",
          failedAt: Timestamp.fromDate(now),
          lastError: error.slice(0, 500),
          leaseUntil: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
    },

    async authorizeDelivery({ subscriberId, deliveryId, attempt }) {
      const subscriberRef = db.collection("subscribers").doc(subscriberId);
      const deliveryRef = db.collection("digestDeliveries").doc(deliveryId);
      return db.runTransaction(async (transaction) => {
        const [subscriber, delivery] = await Promise.all([
          transaction.get(subscriberRef),
          transaction.get(deliveryRef),
        ]);
        const active = subscriber.exists
          ? activeSubscriberFromDocument(subscriber.id, subscriber.data() ?? {})
          : null;
        // This closes the local unsubscribe race. The irreducible boundary is
        // a provider request accepted concurrently after this transaction.
        return Boolean(active && delivery.exists
          && delivery.data()?.status === "sending"
          && delivery.data()?.attempt === attempt
          && delivery.data()?.tokenVersion === active.tokenVersion);
      });
    },

    async startRun({ runId, editionId, cursor, now }) {
      await db.collection("digestRuns").doc(runId).set({
        editionId, cursor, status: "running", startedAt: Timestamp.fromDate(now),
        updatedAt: FieldValue.serverTimestamp(),
      });
    },

    async finishRun({ runId, status, nextCursor, summary, now }) {
      await db.collection("digestRuns").doc(runId).set({
        status, nextCursor,
        // Privacy-safe ledger: counters and IDs, never recipient data.
        counters: { subscribers: summary.subscribers, sent: summary.sent, failed: summary.failed, skipped: summary.skipped, personalized: summary.personalized, generic: summary.generic },
        finishedAt: Timestamp.fromDate(now), updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
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
  const props: DigestEmailProps = {
    issueLabel: input.edition.issueLabel,
    intro: input.edition.intro,
    personalized: input.personalized,
    calendarUrl: new URL("/events", input.siteOrigin).toString(),
    unsubscribePageUrl: input.unsubscribePageUrl,
    oneClickUnsubscribeUrl: input.oneClickUnsubscribeUrl,
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
  if (existing?.status === "ready") return existing;
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
  sendDelayMs?: number;
  cursor?: string | null;
  pageSize?: number;
  deadlineAt?: Date;
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
    runId: randomUUID(),
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
  if (edition.status === "held") {
    summary.status = "success";
    return summary;
  }

  const cursor = input.cursor ?? null;
  if (!dryRun) {
    await input.repository.startRun?.({ runId: summary.runId!, editionId: edition.id, cursor, now });
  }

  const page = input.repository.listActiveSubscribersPage
    ? await input.repository.listActiveSubscribersPage({
      ...(cursor ? { afterId: cursor } : {}),
      limit: input.pageSize ?? DIGEST_PAGE_SIZE,
    })
    : { subscribers: await input.repository.listActiveSubscribers(), nextCursor: null };
  const subscribers = page.subscribers;
  summary.subscribers = subscribers.length;
  const sender = input.sender ?? sendFridayDigest;

  let nextIndex = 0;
  let interrupted = false;
  const sendDelayMs = input.sendDelayMs ?? (input.sender ? 0 : 500);
  async function processSubscriber(subscriber: DigestSubscriber): Promise<boolean> {
    try {
      const preferences = subscriber.personalize && subscriber.userId
        ? await input.repository.getPreferences(subscriber.userId)
        : null;
      const selection = selectDigestEvents(edition, preferences, subscriber.personalize);
      if (selection.personalized) summary.personalized += 1;
      else summary.generic += 1;
      if (dryRun) return false;

      const claim = await input.repository.claimDelivery({
        editionId: edition.id,
        subscriberId: subscriber.id,
        selection,
        now,
      });
      if (!claim) {
        summary.skipped += 1;
        return false;
      }
      if (!mayStartDigestWork(input.deadlineAt)) {
        interrupted = true;
        summary.skipped += 1;
        return false;
      }
      const authorized = await input.repository.authorizeDelivery?.({
        subscriberId: subscriber.id,
        deliveryId: claim.deliveryId,
        attempt: claim.attempt,
      }) ?? true;
      if (!authorized) {
        summary.skipped += 1;
        return false;
      }
      const token = issueEmailToken({
        subscriberId: subscriber.id,
        purpose: "unsubscribe",
        version: claim.tokenVersion,
        expiresAt: claim.unsubscribeExpiresAt,
        secret: input.tokenSecret,
      });
      const unsubscribePageUrl = new URL("/unsubscribe", input.siteOrigin);
      unsubscribePageUrl.searchParams.set("token", token);
      const oneClickUnsubscribeUrl = new URL("/api/subscriptions/unsubscribe", input.siteOrigin);
      oneClickUnsubscribeUrl.searchParams.set("token", token);

      let providerEmailId: string;
      try {
        // The provider call is the only rate-limited operation in a worker.
        providerEmailId = await sender({
          email: claim.subscriberEmail,
          deliveryKey: claim.deliveryKey,
          deliveryId: claim.deliveryId,
          props: emailProps({
            edition,
            eventIds: claim.eventIds,
            personalized: claim.personalized,
            unsubscribePageUrl: unsubscribePageUrl.toString(),
            oneClickUnsubscribeUrl: oneClickUnsubscribeUrl.toString(),
            siteOrigin: input.siteOrigin,
          }),
        });
      } catch (error) {
        if (!(error instanceof EmailProviderTimeoutError)) {
          try {
            await input.repository.markDeliveryFailed({
              deliveryId: claim.deliveryId,
              attempt: claim.attempt,
              error: error instanceof Error ? error.message : "Unknown email delivery error",
              now: new Date(),
            });
          } catch {
            // Leave the lease to expire; a recovery run can safely reclaim it.
          }
        }
        // A timeout is ambiguous: the provider may have accepted the message.
        // Keep the lease so only the immutable idempotent request can be retried.
        summary.failed += 1;
        return true;
      }

      try {
        await input.repository.markDeliverySent({
          deliveryId: claim.deliveryId,
          attempt: claim.attempt,
          providerEmailId,
          now: new Date(),
        });
        summary.sent += 1;
      } catch {
        // Provider accepted the immutable request. Do not mark it failed; the
        // same payload/key can be reconciled after the lease expires.
        summary.failed += 1;
      }
      return true;
    } catch {
      summary.failed += 1;
      return false;
    }
  }

  async function worker() {
    while (true) {
      if (!mayStartDigestWork(input.deadlineAt)) {
        interrupted = true;
        return;
      }
      const index = nextIndex++;
      if (index >= subscribers.length) return;
      const attemptedProviderSend = await processSubscriber(subscribers[index]);
      if (attemptedProviderSend && sendDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, sendDelayMs));
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, subscribers.length) }, () => worker()));
  const deadlinePartial = interrupted || (!mayStartDigestWork(input.deadlineAt) && nextIndex < subscribers.length);
  // If a deadline interrupts a page, resume at its existing cursor. Replaying
  // claimed rows is idempotent and is safer than advancing past a recipient
  // whose local consent check or provider submission never happened.
  summary.nextCursor = deadlinePartial ? cursor : page.nextCursor;
  summary.status = summary.failed > 0 ? "partial" : (deadlinePartial || page.nextCursor ? "partial" : "success");
  if (!dryRun) {
    try {
      await input.repository.finishRun?.({
        runId: summary.runId!, status: summary.status, nextCursor: summary.nextCursor,
        summary, now: new Date(),
      });
    } catch {
      // Provider acceptance is immutable. Report persistence uncertainty rather
      // than creating a duplicate send to repair an operational ledger.
      summary.failed += 1;
      summary.status = "partial";
    }
  }
  return summary;
}
