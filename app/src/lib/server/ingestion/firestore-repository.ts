import { createHash } from "node:crypto";
import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type Firestore,
} from "firebase-admin/firestore";
import { normalizeEventFacts } from "../../events/normalize";
import type { EventDocument } from "../../events/types";
import { planReconciliation } from "./reconcile";
import type {
  EventSourcePolicy,
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
    category: data.category ?? "Community",
    status: data.status ?? "scheduled",
    availability: data.availability ?? "unknown",
    sourceId: data.sourceId ?? "",
    sourceEventId: data.sourceEventId ?? "",
    sourceUrl: data.sourceUrl ?? "",
    publicationStatus: "published",
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

  return snapshot.docs
    .map((document) =>
      existingEvent(document.id, document.data(), input.from)
    )
    .filter((event) => {
      const eventEnd = event.endDate ?? event.date;
      return event.date <= input.to && eventEnd >= input.from;
    });
}

async function writeCandidate(input: {
  db: Firestore;
  source: EventSourcePolicy;
  observation: SourceObservation;
  checkedAt: Date;
}): Promise<void> {
  const id = stableId(input.source.id, input.observation.sourceEventId);
  await input.db.collection("eventCandidates").doc(id).set(
    {
      ...input.observation,
      date: Timestamp.fromDate(input.observation.date),
      endDate: input.observation.endDate
        ? Timestamp.fromDate(input.observation.endDate)
        : null,
      sourceName: input.source.name,
      reviewStatus: "pending",
      reason: "source-requires-review",
      lastSeenAt: Timestamp.fromDate(input.checkedAt),
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function persistActions(input: {
  db: Firestore;
  source: EventSourcePolicy;
  actions: ReconciliationAction[];
  checkedAt: Date;
}): Promise<void> {
  for (let offset = 0; offset < input.actions.length; offset += 90) {
    const batch = input.db.batch();

    for (const action of input.actions.slice(offset, offset + 90)) {
      const eventId =
        action.eventId ??
        ("observation" in action
          ? stableId(input.source.id, action.observation.sourceEventId)
          : stableId(input.source.id, action.event.sourceEventId));
      const eventRef = input.db.collection("events").doc(eventId);

      batch.set(
        eventRef,
        {
          ...serializedEvent(action.event),
          createdBy: "ingest",
          updatedAt: FieldValue.serverTimestamp(),
          ...(action.type === "create"
            ? {
                createdAt: FieldValue.serverTimestamp(),
                interestedCount: 0,
              }
            : {}),
        },
        { merge: true }
      );

      const sourceRecordId = stableId(
        input.source.id,
        action.event.sourceEventId
      );
      const sourceRef = input.db
        .collection("eventSources")
        .doc(sourceRecordId);

      if ("observation" in action) {
        const hash = evidenceHash(action.observation);
        batch.set(
          sourceRef,
          {
            sourceId: input.source.id,
            sourceName: input.source.name,
            sourceEventId: action.observation.sourceEventId,
            eventId,
            sourceUrl: action.observation.sourceUrl,
            evidenceHash: hash,
            observation: {
              ...action.observation,
              date: Timestamp.fromDate(action.observation.date),
              endDate: action.observation.endDate
                ? Timestamp.fromDate(action.observation.endDate)
                : null,
            },
            lastSeenAt: Timestamp.fromDate(input.checkedAt),
            missingRunCount: 0,
            missingSince: null,
            updatedAt: FieldValue.serverTimestamp(),
            ...(action.type === "create"
              ? { firstSeenAt: FieldValue.serverTimestamp() }
              : {}),
          },
          { merge: true }
        );
        batch.set(
          sourceRef.collection("revisions").doc(hash),
          {
            evidenceHash: hash,
            observation: {
              ...action.observation,
              date: Timestamp.fromDate(action.observation.date),
              endDate: action.observation.endDate
                ? Timestamp.fromDate(action.observation.endDate)
                : null,
            },
            capturedAt: Timestamp.fromDate(input.checkedAt),
          },
          { merge: true }
        );
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
      }
    }

    await batch.commit();
  }
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
}) {
  if (!input.source.autoApprove) {
    if (input.write) {
      for (const observation of input.observations) {
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
  });

  if (input.write) {
    await persistActions({
      db: input.db,
      source: input.source,
      actions: plan.actions,
      checkedAt: input.checkedAt,
    });
  }

  return {
    ...plan,
    candidates: 0,
    safetyHeld:
      input.complete && input.observations.length === 0 && existing.length > 0,
  };
}
