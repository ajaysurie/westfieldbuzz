import { normalizeEventFacts } from "../../events/normalize";
import type { EventDocument, EventFacts } from "../../events/types";
import type {
  ExistingSourceEvent,
  ReconciliationAction,
  ReconciliationPlan,
  SourceObservation,
} from "./types";

const COMPARABLE_FIELDS: (keyof EventFacts)[] = [
  "title",
  "description",
  "date",
  "endDate",
  "location",
  "town",
  "category",
  "status",
  "availability",
  "sourceId",
  "sourceEventId",
  "sourceUrl",
];

function comparableValue(value: unknown): unknown {
  return value instanceof Date ? value.getTime() : value;
}

function changedFields(
  current: ExistingSourceEvent,
  next: EventFacts
): string[] {
  return COMPARABLE_FIELDS.filter(
    (field) => comparableValue(current[field]) !== comparableValue(next[field])
  );
}

function applyManualOverrides(
  observation: SourceObservation,
  existing?: ExistingSourceEvent
): SourceObservation {
  if (!existing?.manualOverrides) return observation;
  return {
    ...observation,
    ...existing.manualOverrides,
  } as SourceObservation;
}

function eventDocument(
  observation: SourceObservation,
  checkedAt: Date,
  existing?: ExistingSourceEvent
): EventDocument<Date> {
  const publicFacts = applyManualOverrides(observation, existing);
  return {
    ...publicFacts,
    publicationStatus: "published",
    freshnessStatus: "current",
    lastSeenAt: checkedAt,
    lastVerifiedAt: checkedAt,
    missingSince: null,
    missingRunCount: 0,
    ...(existing?.manualOverrides
      ? { manualOverrides: existing.manualOverrides }
      : {}),
  };
}

export function planReconciliation(input: {
  observations: SourceObservation[];
  existing: ExistingSourceEvent[];
  checkedAt: Date;
  complete: boolean;
  missingGraceRuns: number;
}): ReconciliationPlan {
  const observations = input.observations.map(normalizeEventFacts);
  const existingBySourceEventId = new Map(
    input.existing.map((event) => [event.sourceEventId, event])
  );
  const seen = new Set<string>();
  const actions: ReconciliationAction[] = [];

  for (const observation of observations) {
    if (seen.has(observation.sourceEventId)) continue;
    seen.add(observation.sourceEventId);
    const current = existingBySourceEventId.get(observation.sourceEventId);
    const next = eventDocument(observation, input.checkedAt, current);

    if (!current) {
      actions.push({
        type: "create",
        eventId: null,
        observation,
        event: next,
        changedFields: COMPARABLE_FIELDS.map(String),
      });
      continue;
    }

    const changes = changedFields(current, next);
    actions.push({
      type: changes.length > 0 ? "update" : "verify",
      eventId: current.id,
      observation,
      event: next,
      changedFields: changes,
    });
  }

  if (input.complete) {
    for (const current of input.existing) {
      if (seen.has(current.sourceEventId)) continue;
      const missingRunCount = (current.missingRunCount ?? 0) + 1;
      const stale = missingRunCount >= Math.max(1, input.missingGraceRuns);
      actions.push({
        type: stale ? "stale" : "missing",
        eventId: current.id,
        event: {
          ...current,
          freshnessStatus: stale ? "stale" : "missing",
          missingRunCount,
          missingSince: current.missingSince ?? input.checkedAt,
        },
        changedFields: ["freshnessStatus", "missingRunCount", "missingSince"],
      });
    }
  }

  return {
    actions,
    created: actions.filter((action) => action.type === "create").length,
    updated: actions.filter((action) => action.type === "update").length,
    verified: actions.filter((action) => action.type === "verify").length,
    missing: actions.filter((action) => action.type === "missing").length,
    stale: actions.filter((action) => action.type === "stale").length,
  };
}

