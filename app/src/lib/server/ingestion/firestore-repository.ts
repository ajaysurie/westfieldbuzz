import { createHash } from "node:crypto";
import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type Firestore,
} from "firebase-admin/firestore";
import { normalizeCategory, normalizeEventFacts } from "../../events/normalize";
import type { EventDocument } from "../../events/types";
import {
  eventIdentityFingerprint,
  type EventIdentityFingerprint,
} from "./identity";
import { planReconciliation } from "./reconcile";
import type {
  EventSourcePolicy,
  CreateReconciliationAction,
  ExistingObservedReconciliationAction,
  ExistingSourceEvent,
  ReconciliationAction,
  SourceObservation,
} from "./types";

function stableId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

function dateValue(value: unknown, fallback: Date): Date {
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate();
  }
  return fallback;
}

function nullableDateValue(value: unknown): Date | null {
  if (value == null) return null;
  return dateValue(value, new Date(Number.NaN));
}

function existingEvent(
  id: string,
  data: DocumentData,
  fallbackDate: Date
): ExistingSourceEvent {
  const manualOverrides = data.manualOverrides
    ? {
        ...data.manualOverrides,
        ...(data.manualOverrides.date
          ? { date: dateValue(data.manualOverrides.date, fallbackDate) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(data.manualOverrides, "endDate")
          ? { endDate: nullableDateValue(data.manualOverrides.endDate) }
          : {}),
      }
    : undefined;

  return {
    id,
    title: data.title ?? "",
    description: data.description ?? "",
    date: dateValue(data.date, fallbackDate),
    endDate: nullableDateValue(data.endDate),
    location: data.location ?? "",
    town: data.town ?? "",
    category: normalizeCategory(typeof data.category === "string" ? data.category : undefined),
    status: data.status === "cancelled" || data.status === "postponed"
      || data.status === "rescheduled" || data.status === "weather-dependent"
      ? data.status
      : "scheduled",
    availability: data.availability ?? "unknown",
    sourceId: data.sourceId ?? "",
    sourceEventId: data.sourceEventId ?? "",
    sourceUrl: data.sourceUrl ?? "",
    publicationStatus: data.publicationStatus === "suppressed"
      ? "suppressed"
      : data.publicationStatus === "review-held"
        ? "review-held"
        : "published",
    freshnessStatus: data.freshnessStatus ?? "current",
    lastSeenAt: dateValue(
      data.lastSeenAt ?? data.updatedAt ?? data.createdAt,
      fallbackDate
    ),
    lastVerifiedAt: dateValue(
      data.lastVerifiedAt ?? data.updatedAt ?? data.createdAt,
      fallbackDate
    ),
    missingSince: nullableDateValue(data.missingSince),
    missingRunCount: data.missingRunCount ?? 0,
    sourceEventAliases: Array.isArray(data.sourceEventAliases)
      ? data.sourceEventAliases.filter((value): value is string => typeof value === "string")
      : undefined,
    identityFingerprint: typeof data.identityFingerprint === "string"
      ? data.identityFingerprint
      : undefined,
    manualOverrides,
  };
}

function serializedEvent(event: EventDocument<Date>): DocumentData {
  return {
    ...event,
    date: Timestamp.fromDate(event.date),
    endDate: event.endDate ? Timestamp.fromDate(event.endDate) : null,
    lastSeenAt: Timestamp.fromDate(event.lastSeenAt),
    lastVerifiedAt: Timestamp.fromDate(event.lastVerifiedAt),
    missingSince: event.missingSince
      ? Timestamp.fromDate(event.missingSince)
      : null,
  };
}

function evidenceHash(observation: SourceObservation): string {
  const normalized = normalizeEventFacts(observation);
  return createHash("sha256")
    .update(
      JSON.stringify({
        ...normalized,
        date: normalized.date.toISOString(),
        endDate: normalized.endDate?.toISOString() ?? null,
      })
    )
    .digest("hex");
}

async function loadExistingEvents(input: {
  db: Firestore;
  sourceId: string;
  from: Date;
  to: Date;
}): Promise<ExistingSourceEvent[]> {
  const snapshot = await input.db
    .collection("events")
    .where("sourceId", "==", input.sourceId)
    .get();

  // Load every event from the source: a recurrence override may move into this
  // crawl window from an older original slot. Windowing happens only when
  // considering absent events for missing/stale state below.
  return snapshot.docs.map((document) =>
    existingEvent(document.id, document.data(), input.from)
  );
}

async function writeCandidate(input: {
  db: Firestore;
  source: EventSourcePolicy;
  observation: SourceObservation;
  checkedAt: Date;
  reason?:
    | "source-requires-review"
    | "ambiguous-source-event-alias"
    | "possible-cross-source-duplicate"
    | "fingerprint-registry-inconsistency"
    | "existing-event-conflict";
  matchingEventIds?: string[];
  matchingSourceIds?: string[];
  identity?: EventIdentityFingerprint;
}): Promise<{ holdCount: number; firstHeldAt: Date }> {
  const id = stableId(input.source.id, input.observation.sourceEventId);
  const ref = input.db.collection("eventCandidates").doc(id);
  return input.db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    const review = existing.exists ? existing.data() ?? {} : {};
    const priorStatus = typeof review.reviewStatus === "string" ? review.reviewStatus : "pending";
    const holdCount = typeof review.holdCount === "number" ? review.holdCount + 1 : 1;
    const firstHeldAt = dateValue(review.firstHeldAt, input.checkedAt);
    transaction.set(ref, {
      ...input.observation,
      date: Timestamp.fromDate(input.observation.date),
      endDate: input.observation.endDate
        ? Timestamp.fromDate(input.observation.endDate)
        : null,
      sourceName: input.source.name,
      // A crawler can refresh source facts but can never reopen or overwrite
      // an operator's decision.
      reviewStatus: priorStatus,
      ...(review.reviewedAt ? { reviewedAt: review.reviewedAt } : {}),
      ...(review.reviewedBy ? { reviewedBy: review.reviewedBy } : {}),
      ...(review.reviewNotes ? { reviewNotes: review.reviewNotes } : {}),
      reason: input.reason ?? "source-requires-review",
      ...(input.matchingEventIds
        ? { matchingEventIds: input.matchingEventIds }
        : {}),
      ...(input.matchingSourceIds
        ? { matchingSourceIds: input.matchingSourceIds }
        : {}),
      ...(input.identity
        ? {
            identityFingerprint: input.identity.hash,
            identityEvidence: input.identity.evidence,
          }
        : {}),
      lastSeenAt: Timestamp.fromDate(input.checkedAt),
      holdCount,
      firstHeldAt: Timestamp.fromDate(firstHeldAt),
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp(), firstSeenAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
    return { holdCount, firstHeldAt };
  });
}

async function holdAffectedEvents(input: {
  db: Firestore;
  eventIds: string[];
  hold: { holdCount: number; firstHeldAt: Date };
  checkedAt: Date;
}): Promise<void> {
  // Keep known-good projections briefly while a single transient upstream
  // conflict settles. Repeated or day-old holds leave public search/digest.
  const aged = input.checkedAt.valueOf() - input.hold.firstHeldAt.valueOf() >= 24 * 60 * 60 * 1000;
  if (input.hold.holdCount < 2 && !aged) return;
  await Promise.all(input.eventIds.map((eventId) => input.db.runTransaction(async (transaction) => {
    const ref = input.db.collection("events").doc(eventId);
    const event = await transaction.get(ref);
    if (!event.exists || event.data()?.publicationStatus === "suppressed") return;
    transaction.set(ref, {
      publicationStatus: "review-held",
      reviewHeldAt: Timestamp.fromDate(input.checkedAt),
      freshnessStatus: "stale",
      // Do not advance lastVerifiedAt while facts are under identity review.
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  })));
}

function sourceRecordId(sourceId: string, sourceEventId: string): string {
  return stableId(sourceId, sourceEventId);
}

function serializedObservation(observation: SourceObservation): DocumentData {
  return {
    ...observation,
    date: Timestamp.fromDate(observation.date),
    endDate: observation.endDate ? Timestamp.fromDate(observation.endDate) : null,
  };
}

function eventWriteData(input: {
  event: EventDocument<Date>;
  identity: EventIdentityFingerprint;
  create: boolean;
}): DocumentData {
  return {
    ...serializedEvent(input.event),
    identityFingerprint: input.identity.hash,
    identityEvidence: input.identity.evidence,
    createdBy: "ingest",
    updatedAt: FieldValue.serverTimestamp(),
    ...(input.create
      ? {
          createdAt: FieldValue.serverTimestamp(),
          interestedCount: 0,
        }
      : {}),
  };
}

function sourceWriteData(input: {
  source: EventSourcePolicy;
  observation: SourceObservation;
  eventId: string;
  checkedAt: Date;
  identity: EventIdentityFingerprint;
  create: boolean;
}): DocumentData {
  const hash = evidenceHash(input.observation);
  return {
    sourceId: input.source.id,
    sourceName: input.source.name,
    sourceEventId: input.observation.sourceEventId,
    eventId: input.eventId,
    sourceUrl: input.observation.sourceUrl,
    evidenceHash: hash,
    identityFingerprint: input.identity.hash,
    identityEvidence: input.identity.evidence,
    observation: serializedObservation(input.observation),
    lastSeenAt: Timestamp.fromDate(input.checkedAt),
    missingRunCount: 0,
    missingSince: null,
    updatedAt: FieldValue.serverTimestamp(),
    ...(input.create ? { firstSeenAt: FieldValue.serverTimestamp() } : {}),
  };
}

function revisionWriteData(input: {
  observation: SourceObservation;
  checkedAt: Date;
  identity: EventIdentityFingerprint;
}): DocumentData {
  return {
    evidenceHash: evidenceHash(input.observation),
    identityFingerprint: input.identity.hash,
    identityEvidence: input.identity.evidence,
    observation: serializedObservation(input.observation),
    capturedAt: Timestamp.fromDate(input.checkedAt),
  };
}

type CreateClaimResult =
  | { status: "created"; eventId: string }
  | {
      status: "held";
      reason:
        | "possible-cross-source-duplicate"
        | "fingerprint-registry-inconsistency"
        | "existing-event-conflict";
      matchingEventIds: string[];
      matchingSourceIds: string[];
    };

async function existingFingerprintMatches(input: {
  db: Firestore;
  fingerprint: EventIdentityFingerprint;
  sourceId: string;
}): Promise<{ eventIds: string[]; sourceIds: string[] }> {
  const snapshot = await input.db
    .collection("events")
    .where("identityFingerprint", "==", input.fingerprint.hash)
    .get();
  const matches = snapshot.docs.filter((document) => document.data().sourceId !== input.sourceId);
  return {
    eventIds: matches.map((document) => document.id).sort(),
    sourceIds: [...new Set(matches.map((document) => document.data().sourceId)
      .filter((sourceId): sourceId is string => typeof sourceId === "string"))].sort(),
  };
}

async function claimCreate(input: {
  db: Firestore;
  source: EventSourcePolicy;
  action: CreateReconciliationAction;
  checkedAt: Date;
}): Promise<CreateClaimResult> {
  const identity = eventIdentityFingerprint(input.action.observation);
  const legacyMatches = await existingFingerprintMatches({
    db: input.db,
    fingerprint: identity,
    sourceId: input.source.id,
  });
  if (legacyMatches.eventIds.length) {
    return {
      status: "held",
      reason: "possible-cross-source-duplicate",
      matchingEventIds: legacyMatches.eventIds,
      matchingSourceIds: legacyMatches.sourceIds,
    };
  }

  const eventId = stableId(input.source.id, input.action.observation.sourceEventId);
  const eventRef = input.db.collection("events").doc(eventId);
  const registryRef = input.db.collection("eventFingerprintRegistry").doc(identity.hash);
  const sourceRef = input.db.collection("eventSources")
    .doc(sourceRecordId(input.source.id, input.action.observation.sourceEventId));
  const revisionRef = sourceRef.collection("revisions").doc(evidenceHash(input.action.observation));

  return input.db.runTransaction(async (transaction) => {
    const registry = await transaction.get(registryRef);
    if (registry.exists) {
      const registryEventId = registry.data()?.eventId;
      const registrySourceId = registry.data()?.sourceId;
      if (typeof registryEventId !== "string" || !registryEventId) {
        return {
          status: "held",
          reason: "fingerprint-registry-inconsistency",
          matchingEventIds: [],
          matchingSourceIds: typeof registrySourceId === "string" ? [registrySourceId] : [],
        };
      }
      const claimedEvent = await transaction.get(input.db.collection("events").doc(registryEventId));
      if (!claimedEvent.exists) {
        return {
          status: "held",
          reason: "fingerprint-registry-inconsistency",
          matchingEventIds: [registryEventId],
          matchingSourceIds: typeof registrySourceId === "string" ? [registrySourceId] : [],
        };
      }
      const claimedSourceId = claimedEvent.data()?.sourceId;
      return {
        status: "held",
        reason: claimedSourceId !== input.source.id || registrySourceId !== input.source.id
          ? "possible-cross-source-duplicate"
          : "existing-event-conflict",
        matchingEventIds: [registryEventId],
        matchingSourceIds: [...new Set([registrySourceId, claimedSourceId]
          .filter((sourceId): sourceId is string => typeof sourceId === "string"))].sort(),
      };
    }

    // A create action must never turn into a merge. This protects us if a
    // source is retried after the plan was made but before this transaction.
    const targetEvent = await transaction.get(eventRef);
    if (targetEvent.exists) {
      return {
        status: "held",
        reason: "existing-event-conflict",
        matchingEventIds: [eventId],
        matchingSourceIds: typeof targetEvent.data()?.sourceId === "string"
          ? [targetEvent.data()!.sourceId]
          : [],
      };
    }

    transaction.set(registryRef, {
      version: identity.version,
      fingerprint: identity.hash,
      evidence: identity.evidence,
      eventId,
      sourceId: input.source.id,
      sourceEventId: input.action.observation.sourceEventId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(eventRef, eventWriteData({
      event: input.action.event,
      identity,
      create: true,
    }));
    transaction.set(sourceRef, sourceWriteData({
      source: input.source,
      observation: input.action.observation,
      eventId,
      checkedAt: input.checkedAt,
      identity,
      create: true,
    }), { merge: true });
    transaction.set(revisionRef, revisionWriteData({
      observation: input.action.observation,
      checkedAt: input.checkedAt,
      identity,
    }), { merge: true });
    return { status: "created", eventId };
  });
}

type ObservedUpdateResult =
  | { status: "updated" }
  | Exclude<CreateClaimResult, { status: "created" }>;

async function persistObservedUpdate(input: {
  db: Firestore;
  source: EventSourcePolicy;
  action: ExistingObservedReconciliationAction;
  checkedAt: Date;
}): Promise<ObservedUpdateResult> {
  const identity = eventIdentityFingerprint(input.action.observation);
  const eventRef = input.db.collection("events").doc(input.action.eventId);
  const registryRef = input.db.collection("eventFingerprintRegistry").doc(identity.hash);
  const oldRegistryRef = input.action.previousIdentityFingerprint
    && input.action.previousIdentityFingerprint !== identity.hash
    ? input.db.collection("eventFingerprintRegistry").doc(input.action.previousIdentityFingerprint)
    : null;
  const sourceRef = input.db.collection("eventSources")
    .doc(sourceRecordId(input.source.id, input.action.observation.sourceEventId));
  const revisionRef = sourceRef.collection("revisions").doc(evidenceHash(input.action.observation));

  return input.db.runTransaction(async (transaction) => {
    const [event, registry, oldRegistry] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(registryRef),
      oldRegistryRef ? transaction.get(oldRegistryRef) : Promise.resolve(null),
    ]);
    if (!event.exists) {
      return {
        status: "held",
        reason: "existing-event-conflict",
        matchingEventIds: [input.action.eventId],
        matchingSourceIds: [],
      };
    }
    if (registry.exists && registry.data()?.eventId !== input.action.eventId) {
      const registryEventId = registry.data()?.eventId;
      const registrySourceId = registry.data()?.sourceId;
      const claimedEvent = typeof registryEventId === "string"
        ? await transaction.get(input.db.collection("events").doc(registryEventId))
        : null;
      if (!claimedEvent?.exists) {
        return {
          status: "held",
          reason: "fingerprint-registry-inconsistency",
          matchingEventIds: typeof registryEventId === "string" ? [registryEventId] : [],
          matchingSourceIds: typeof registrySourceId === "string" ? [registrySourceId] : [],
        };
      }
      const claimedSourceId = claimedEvent.data()?.sourceId;
      return {
        status: "held",
        reason: "possible-cross-source-duplicate",
        matchingEventIds: [registryEventId],
        matchingSourceIds: [...new Set([registrySourceId, claimedSourceId]
          .filter((sourceId): sourceId is string => typeof sourceId === "string"))].sort(),
      };
    }

    if (!registry.exists) {
      transaction.set(registryRef, {
        version: identity.version,
        fingerprint: identity.hash,
        evidence: identity.evidence,
        eventId: input.action.eventId,
        sourceId: input.source.id,
        sourceEventId: input.action.observation.sourceEventId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    transaction.set(eventRef, eventWriteData({
      event: input.action.event,
      identity,
      create: false,
    }), { merge: true });
    transaction.set(sourceRef, sourceWriteData({
      source: input.source,
      observation: input.action.observation,
      eventId: input.action.eventId,
      checkedAt: input.checkedAt,
      identity,
      create: false,
    }), { merge: true });
    transaction.set(revisionRef, revisionWriteData({
      observation: input.action.observation,
      checkedAt: input.checkedAt,
      identity,
    }), { merge: true });
    if (oldRegistryRef && oldRegistry?.exists && oldRegistry.data()?.eventId === input.action.eventId) {
      transaction.delete(oldRegistryRef);
    }
    return { status: "updated" };
  });
}

async function persistActions(input: {
  db: Firestore;
  source: EventSourcePolicy;
  actions: ReconciliationAction[];
  checkedAt: Date;
  deadlineAt?: Date;
}): Promise<{ committed: number; incomplete: boolean }> {
  let committed = 0;
  for (let offset = 0; offset < input.actions.length; offset += 90) {
    // Do not reserve a batch once the invocation's hard deadline has passed.
    // A batch that was already committed is counted truthfully below.
    if (input.deadlineAt && Date.now() >= input.deadlineAt.getTime()) {
      return { committed, incomplete: true };
    }
    const batch = input.db.batch();
    let writes = 0;

    for (const action of input.actions.slice(offset, offset + 90)) {
      if (action.type === "safety-held" || action.type === "create"
        || action.type === "update" || action.type === "verify") continue;
      const eventId = action.eventId;
      const eventRef = input.db.collection("events").doc(eventId);

      const identity = "observation" in action
        ? eventIdentityFingerprint(action.observation)
        : undefined;

      batch.set(
        eventRef,
        identity
          ? eventWriteData({ event: action.event, identity, create: false })
          : {
              ...serializedEvent(action.event),
              createdBy: "ingest",
              updatedAt: FieldValue.serverTimestamp(),
            },
        { merge: true }
      );
      writes += 1;

      const sourceId = sourceRecordId(
        input.source.id,
        action.event.sourceEventId
      );
      const sourceRef = input.db
        .collection("eventSources")
        .doc(sourceId);

      if ("observation" in action) {
        batch.set(
          sourceRef,
          sourceWriteData({
            source: input.source,
            observation: action.observation,
            eventId,
            checkedAt: input.checkedAt,
            identity: identity!,
            create: false,
          }),
          { merge: true }
        );
        batch.set(
          sourceRef.collection("revisions").doc(evidenceHash(action.observation)),
          revisionWriteData({
            observation: action.observation,
            checkedAt: input.checkedAt,
            identity: identity!,
          }),
          { merge: true }
        );
        writes += 2;
      } else {
        batch.set(
          sourceRef,
          {
            missingRunCount: action.event.missingRunCount,
            missingSince: action.event.missingSince
              ? Timestamp.fromDate(action.event.missingSince)
              : null,
            freshnessStatus: action.event.freshnessStatus,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        writes += 1;
      }
    }
    if (writes > 0) {
      await batch.commit();
      committed += Math.ceil(writes / 2);
    }
  }
  return { committed, incomplete: false };
}

async function inspectCreateClaim(input: {
  db: Firestore;
  source: EventSourcePolicy;
  action: CreateReconciliationAction;
}): Promise<Exclude<CreateClaimResult, { status: "created" }> | null> {
  const identity = eventIdentityFingerprint(input.action.observation);
  const legacyMatches = await existingFingerprintMatches({
    db: input.db,
    fingerprint: identity,
    sourceId: input.source.id,
  });
  if (legacyMatches.eventIds.length) {
    return {
      status: "held",
      reason: "possible-cross-source-duplicate",
      matchingEventIds: legacyMatches.eventIds,
      matchingSourceIds: legacyMatches.sourceIds,
    };
  }
  const registry = await input.db.collection("eventFingerprintRegistry").doc(identity.hash).get();
  if (!registry.exists) return null;
  const registryEventId = registry.data()?.eventId;
  const registrySourceId = registry.data()?.sourceId;
  if (typeof registryEventId !== "string" || !registryEventId) {
    return {
      status: "held",
      reason: "fingerprint-registry-inconsistency",
      matchingEventIds: [],
      matchingSourceIds: typeof registrySourceId === "string" ? [registrySourceId] : [],
    };
  }
  const event = await input.db.collection("events").doc(registryEventId).get();
  if (!event.exists) {
    return {
      status: "held",
      reason: "fingerprint-registry-inconsistency",
      matchingEventIds: [registryEventId],
      matchingSourceIds: typeof registrySourceId === "string" ? [registrySourceId] : [],
    };
  }
  const eventSourceId = event.data()?.sourceId;
  return {
    status: "held",
    reason: eventSourceId !== input.source.id || registrySourceId !== input.source.id
      ? "possible-cross-source-duplicate"
      : "existing-event-conflict",
    matchingEventIds: [registryEventId],
    matchingSourceIds: [...new Set([registrySourceId, eventSourceId]
      .filter((sourceId): sourceId is string => typeof sourceId === "string"))].sort(),
  };
}

async function inspectObservedUpdate(input: {
  db: Firestore;
  source: EventSourcePolicy;
  action: ExistingObservedReconciliationAction;
}): Promise<Exclude<CreateClaimResult, { status: "created" }> | null> {
  const identity = eventIdentityFingerprint(input.action.observation);
  const registry = await input.db.collection("eventFingerprintRegistry").doc(identity.hash).get();
  if (!registry.exists || registry.data()?.eventId === input.action.eventId) return null;
  const registryEventId = registry.data()?.eventId;
  const registrySourceId = registry.data()?.sourceId;
  const claimedEvent = typeof registryEventId === "string"
    ? await input.db.collection("events").doc(registryEventId).get()
    : null;
  if (!claimedEvent?.exists) {
    return {
      status: "held",
      reason: "fingerprint-registry-inconsistency",
      matchingEventIds: typeof registryEventId === "string" ? [registryEventId] : [],
      matchingSourceIds: typeof registrySourceId === "string" ? [registrySourceId] : [],
    };
  }
  const claimedSourceId = claimedEvent.data()?.sourceId;
  return {
    status: "held",
    reason: "possible-cross-source-duplicate",
    matchingEventIds: [registryEventId],
    matchingSourceIds: [...new Set([registrySourceId, claimedSourceId]
      .filter((sourceId): sourceId is string => typeof sourceId === "string"))].sort(),
  };
}

export async function reconcileSource(input: {
  db: Firestore;
  source: EventSourcePolicy;
  observations: SourceObservation[];
  checkedAt: Date;
  from: Date;
  to: Date;
  complete: boolean;
  write: boolean;
  deadlineAt?: Date;
}) {
  const deadlineReached = () => Boolean(
    input.deadlineAt && Date.now() >= input.deadlineAt.getTime()
  );
  const incompleteResult = (values: {
    actions: ReconciliationAction[];
    created: number;
    updated: number;
    verified: number;
    missing: number;
    stale: number;
    candidates: number;
    safetyHeld: boolean;
  }) => ({ ...values, incomplete: true });
  if (!input.source.autoApprove) {
    if (input.write) {
      for (const observation of input.observations) {
        if (deadlineReached()) {
          return incompleteResult({ actions: [], created: 0, updated: 0, verified: 0, missing: 0, stale: 0, candidates: 0, safetyHeld: true });
        }
        await writeCandidate({
          db: input.db,
          source: input.source,
          observation,
          checkedAt: input.checkedAt,
        });
      }
    }
    return {
      actions: [],
      created: 0,
      updated: 0,
      verified: 0,
      missing: 0,
      stale: 0,
      candidates: input.observations.length,
      safetyHeld: false,
    };
  }

  const existing = await loadExistingEvents({
    db: input.db,
    sourceId: input.source.id,
    from: input.from,
    to: input.to,
  });
  const plan = planReconciliation({
    observations: input.observations,
    existing,
    checkedAt: input.checkedAt,
    complete:
      input.complete && !(input.observations.length === 0 && existing.length > 0),
    missingGraceRuns: input.source.missingGraceRuns,
    activeWindow: { from: input.from, to: input.to },
  });

  const createActions = plan.actions.filter(
    (action): action is CreateReconciliationAction => action.type === "create"
  );
  const claimHolds: Array<{
    action: CreateReconciliationAction;
    result: Exclude<CreateClaimResult, { status: "created" }>;
  }> = [];
  const observedActions = plan.actions.filter(
    (action): action is ExistingObservedReconciliationAction => action.type === "update" || action.type === "verify"
  );
  const observedHolds: Array<{
    action: ExistingObservedReconciliationAction;
    result: Exclude<CreateClaimResult, { status: "created" }>;
  }> = [];

  if (input.write) {
    for (const action of plan.actions) {
      if (action.type !== "safety-held") continue;
      if (deadlineReached()) break;
      await writeCandidate({
        db: input.db,
        source: input.source,
        observation: action.observation,
        checkedAt: input.checkedAt,
        reason: action.reason,
        matchingEventIds: action.matchingEventIds,
        matchingSourceIds: action.matchingSourceIds,
        identity: eventIdentityFingerprint(action.observation),
      });
    }
    for (const action of createActions) {
      if (deadlineReached()) break;
      const result = await claimCreate({
        db: input.db,
        source: input.source,
        action,
        checkedAt: input.checkedAt,
      });
      if (result.status === "created") continue;
      claimHolds.push({ action, result });
      const hold = await writeCandidate({
        db: input.db,
        source: input.source,
        observation: action.observation,
        checkedAt: input.checkedAt,
        reason: result.reason,
        matchingEventIds: result.matchingEventIds,
        matchingSourceIds: result.matchingSourceIds,
        identity: eventIdentityFingerprint(action.observation),
      });
      await holdAffectedEvents({
        db: input.db,
        eventIds: result.matchingEventIds,
        hold,
        checkedAt: input.checkedAt,
      });
    }
    for (const action of observedActions) {
      if (deadlineReached()) break;
      const result = await persistObservedUpdate({
        db: input.db,
        source: input.source,
        action,
        checkedAt: input.checkedAt,
      });
      if (result.status === "updated") continue;
      observedHolds.push({ action, result });
      const hold = await writeCandidate({
        db: input.db,
        source: input.source,
        observation: action.observation,
        checkedAt: input.checkedAt,
        reason: result.reason,
        matchingEventIds: result.matchingEventIds,
        matchingSourceIds: result.matchingSourceIds,
        identity: eventIdentityFingerprint(action.observation),
      });
      await holdAffectedEvents({
        db: input.db,
        eventIds: result.matchingEventIds,
        hold,
        checkedAt: input.checkedAt,
      });
    }
    // Missing/stale transitions are only safe after the entire observed pass
    // finished. A partial crawl must never make an unseen event look absent.
    if (!deadlineReached()) {
      await persistActions({
        db: input.db,
        source: input.source,
        actions: plan.actions.filter((action) => action.type === "missing" || action.type === "stale"),
        checkedAt: input.checkedAt,
        deadlineAt: input.deadlineAt,
      });
    }
  } else {
    for (const action of createActions) {
      const result = await inspectCreateClaim({
        db: input.db,
        source: input.source,
        action,
      });
      if (result) claimHolds.push({ action, result });
    }
    for (const action of observedActions) {
      const result = await inspectObservedUpdate({
        db: input.db,
        source: input.source,
        action,
      });
      if (result) observedHolds.push({ action, result });
    }
  }

  const incomplete = deadlineReached();
  const result = {
    ...plan,
    actions: plan.actions.filter((action) =>
      !claimHolds.some((hold) => hold.action === action)
      && !observedHolds.some((hold) => hold.action === action)
    ),
    created: plan.created - claimHolds.length,
    updated: plan.updated - observedHolds.filter((entry) => entry.action.type === "update").length,
    verified: plan.verified - observedHolds.filter((entry) => entry.action.type === "verify").length,
    candidates: plan.safetyHeld + claimHolds.length + observedHolds.length,
    safetyHeld:
      plan.safetyHeld > 0 || claimHolds.length > 0 || observedHolds.length > 0
      || (input.complete && input.observations.length === 0 && existing.length > 0),
  };
  if (!incomplete) return result;

  // Counts are committed progress, not a plan forecast. A caller can expose a
  // 207 partial run without claiming writes that we deliberately skipped.
  return incompleteResult({
    ...result,
    created: Math.min(result.created, createActions.length - claimHolds.length),
    updated: Math.min(result.updated, observedActions.filter((action) => action.type === "update").length),
    verified: Math.min(result.verified, observedActions.filter((action) => action.type === "verify").length),
    missing: 0,
    stale: 0,
    safetyHeld: true,
  });
}
