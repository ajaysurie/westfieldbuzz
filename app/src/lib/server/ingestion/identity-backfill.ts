import {
  eventIdentityFingerprint,
  type EventIdentityFingerprint,
} from "./identity";

export interface IdentityBackfillEvent {
  id: string;
  title?: string;
  date?: Date | null;
  location?: string;
  town?: string;
  sourceId?: string;
  sourceEventId?: string;
  identityFingerprint?: string;
}

export interface ExistingFingerprintRegistryEntry {
  fingerprint: string;
  eventId?: string;
  sourceId?: string;
}

export interface IdentityBackfillEntry {
  event: IdentityBackfillEvent;
  identity: EventIdentityFingerprint;
  createRegistry: boolean;
}

export interface IdentityBackfillPlan {
  entries: IdentityBackfillEntry[];
  duplicateFingerprints: Array<{ fingerprint: string; eventIds: string[] }>;
  fieldConflicts: Array<{ eventId: string; currentFingerprint: string; proposedFingerprint: string }>;
  orphanEvents: string[];
  orphanRegistryEntries: Array<{ fingerprint: string; eventId?: string }>;
  registryConflicts: Array<{ fingerprint: string; eventId: string; registryEventId?: string }>;
  /** Every legacy record omitted by the old filtered backfill is now visible. */
  invalidEvents: Array<{ eventId: string; reason: "missing-evidence" | "malformed" }>;
}

export function planIdentityBackfill(input: {
  events: IdentityBackfillEvent[];
  sourceEventIds: Set<string>;
  registry: ExistingFingerprintRegistryEntry[];
}): IdentityBackfillPlan {
  const invalidEvents: IdentityBackfillPlan["invalidEvents"] = [];
  const computed = input.events.flatMap((event) => {
    if (!event.title || !event.date || !event.location || !event.town) {
      invalidEvents.push({ eventId: event.id, reason: "malformed" });
      return [];
    }
    if (!event.sourceId || !event.sourceEventId || !input.sourceEventIds.has(event.id)) {
      invalidEvents.push({ eventId: event.id, reason: "missing-evidence" });
      return [];
    }
    const validEvent = event as IdentityBackfillEvent & { title: string; date: Date; location: string; town: string; sourceId: string; sourceEventId: string };
    return [{ event: validEvent, identity: eventIdentityFingerprint(validEvent) }];
  });
  const byFingerprint = new Map<string, typeof computed>();
  for (const row of computed) {
    byFingerprint.set(row.identity.hash, [...(byFingerprint.get(row.identity.hash) ?? []), row]);
  }
  const duplicateFingerprints = [...byFingerprint.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([fingerprint, rows]) => ({ fingerprint, eventIds: rows.map((row) => row.event.id).sort() }));
  const duplicateSet = new Set(duplicateFingerprints.map((entry) => entry.fingerprint));
  const eventIds = new Set(input.events.map((event) => event.id));
  const registryByFingerprint = new Map(input.registry.map((entry) => [entry.fingerprint, entry]));
  const orphanRegistryEntries = input.registry
    .filter((entry) => !entry.eventId || !eventIds.has(entry.eventId))
    .map((entry) => ({ fingerprint: entry.fingerprint, eventId: entry.eventId }));
  const fieldConflicts: IdentityBackfillPlan["fieldConflicts"] = [];
  const orphanEvents: string[] = [];
  const registryConflicts: IdentityBackfillPlan["registryConflicts"] = [];
  const entries: IdentityBackfillEntry[] = [];

  for (const row of computed) {
    if (duplicateSet.has(row.identity.hash)) continue;
    if (row.event.identityFingerprint && row.event.identityFingerprint !== row.identity.hash) {
      fieldConflicts.push({
        eventId: row.event.id,
        currentFingerprint: row.event.identityFingerprint,
        proposedFingerprint: row.identity.hash,
      });
      continue;
    }
    const registry = registryByFingerprint.get(row.identity.hash);
    if (registry?.eventId && registry.eventId !== row.event.id) {
      registryConflicts.push({
        fingerprint: row.identity.hash,
        eventId: row.event.id,
        registryEventId: registry.eventId,
      });
      continue;
    }
    entries.push({
      event: row.event,
      identity: row.identity,
      createRegistry: !registry,
    });
  }

  return {
    entries,
    duplicateFingerprints,
    fieldConflicts,
    orphanEvents: orphanEvents.sort(),
    orphanRegistryEntries,
    registryConflicts,
    invalidEvents: invalidEvents.sort((a, b) => a.eventId.localeCompare(b.eventId)),
  };
}

export async function applyIdentityBackfill(
  plan: IdentityBackfillPlan,
  applyEntry: (entry: IdentityBackfillEntry) => Promise<boolean>,
  apply = false
): Promise<{ attempted: number; written: number; skipped: number }> {
  if (!apply) return { attempted: 0, written: 0, skipped: 0 };
  let written = 0;
  let skipped = 0;
  for (const entry of plan.entries) {
    if (await applyEntry(entry)) written += 1;
    else skipped += 1;
  }
  return { attempted: plan.entries.length, written, skipped };
}
