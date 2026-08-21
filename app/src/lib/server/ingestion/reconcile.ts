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
  next: EventDocument<Date>
): string[] {
  const changes = COMPARABLE_FIELDS.filter(
    (field) => comparableValue(current[field]) !== comparableValue(next[field])
  );
  if (
    JSON.stringify(current.sourceEventAliases ?? [])
    !== JSON.stringify(next.sourceEventAliases ?? [])
  ) {
    return [...changes.map(String), "sourceEventAliases"];
  }
  return changes.map(String);
}

function normalizedAliases(aliases: string[] | undefined): string[] | undefined {
  const unique = [...new Set((aliases ?? []).map((alias) => alias.trim()).filter(Boolean))]
    .sort();
  return unique.length ? unique : undefined;
}

function normalizeObservation(observation: SourceObservation): SourceObservation {
  const normalized = normalizeEventFacts(observation);
  const aliases = normalizedAliases(observation.sourceEventAliases)
    ?.filter((alias) => alias !== normalized.sourceEventId);
  return { ...normalized, ...(aliases?.length ? { sourceEventAliases: aliases } : {}) };
}

function applyManualOverrides(
  observation: SourceObservation,
  existing?: ExistingSourceEvent
): SourceObservation {
  if (!existing?.manualOverrides) return observation;
  return {
    ...observation,
    ...existing.manualOverrides,
    ...(observation.status === "cancelled" ? { status: "cancelled" as const } : {}),
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
    // Suppression and an operator review hold are lifecycle state, not facts
    // from an upstream crawler. A refresh must never republish either.
    publicationStatus: existing?.publicationStatus ?? "published",
    freshnessStatus: "current",
    lastSeenAt: checkedAt,
    lastVerifiedAt: checkedAt,
    missingSince: null,
    missingRunCount: 0,
    ...(existing?.manualOverrides
      ? { manualOverrides: existing.manualOverrides }
      : {}),
    ...(existing?.provenance ? { provenance: existing.provenance } : { provenance: "crawler" as const }),
    ...(existing?.manualVerification ? { manualVerification: existing.manualVerification } : {}),
    ...(existing?.suppressedAt ? { suppressedAt: existing.suppressedAt } : {}),
    ...(existing?.suppressedBy ? { suppressedBy: existing.suppressedBy } : {}),
    ...(existing?.suppressionReason ? { suppressionReason: existing.suppressionReason } : {}),
    ...(existing?.reviewHeldAt ? { reviewHeldAt: existing.reviewHeldAt } : {}),
    ...(publicFacts.sourceEventAliases?.length
      ? { sourceEventAliases: publicFacts.sourceEventAliases }
      : {}),
  };
}

function overlapsActiveWindow(
  event: ExistingSourceEvent,
  window: { from: Date; to: Date } | undefined
): boolean {
  if (!window) return true;
  return event.date <= window.to && (event.endDate ?? event.date) >= window.from;
}

export function planReconciliation(input: {
  observations: SourceObservation[];
  existing: ExistingSourceEvent[];
  checkedAt: Date;
  complete: boolean;
  missingGraceRuns: number;
  activeWindow?: { from: Date; to: Date };
}): ReconciliationPlan {
  const observations = input.observations.map(normalizeObservation);
  const existingBySourceEventId = new Map<string, ExistingSourceEvent[]>();
  for (const event of input.existing) {
    for (const identifier of [event.sourceEventId, ...(event.sourceEventAliases ?? [])]) {
      if (!identifier) continue;
      existingBySourceEventId.set(identifier, [
        ...(existingBySourceEventId.get(identifier) ?? []),
        event,
      ]);
    }
  }
  const seenObservationIds = new Set<string>();
  const seenExistingEventIds = new Set<string>();
  const actions: ReconciliationAction[] = [];

  for (const observation of observations) {
    if (seenObservationIds.has(observation.sourceEventId)) continue;
    seenObservationIds.add(observation.sourceEventId);
    const uniqueEvents = (events: ExistingSourceEvent[]) => [...new Map(
      events.map((event) => [event.id, event])
    ).values()];
    const primaryMatches = uniqueEvents(
      existingBySourceEventId.get(observation.sourceEventId) ?? []
    );
    // Primary identity is authoritative. Legacy aliases are a migration path
    // only when no current primary key exists.
    const matches = primaryMatches.length > 0
      ? primaryMatches
      : uniqueEvents(observation.sourceEventAliases
        ?.flatMap((alias) => existingBySourceEventId.get(alias) ?? []) ?? []);
    if (matches.length > 1) {
      matches.forEach((event) => seenExistingEventIds.add(event.id));
      actions.push({
        type: "safety-held",
        observation,
        reason: "ambiguous-source-event-alias",
        matchingEventIds: matches.map((event) => event.id).sort(),
      });
      continue;
    }
    const current = matches[0];
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

    seenExistingEventIds.add(current.id);
    const changes = changedFields(current, next);
    actions.push({
      type: changes.length > 0 ? "update" : "verify",
      eventId: current.id,
      observation,
      event: next,
      changedFields: changes,
      ...(current.identityFingerprint
        ? { previousIdentityFingerprint: current.identityFingerprint }
        : {}),
    });
  }

  if (input.complete) {
    for (const current of input.existing) {
      if (seenExistingEventIds.has(current.id) || !overlapsActiveWindow(current, input.activeWindow)) continue;
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
    safetyHeld: actions.filter((action) => action.type === "safety-held").length,
  };
}
