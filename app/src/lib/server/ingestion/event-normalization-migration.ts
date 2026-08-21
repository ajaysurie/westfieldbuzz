import { createHash } from "node:crypto";
import { normalizeCategory } from "../../events/normalize";
import { eventIdentityFingerprint } from "./identity";

export type LegacyClassification =
  | "ready"
  | "duplicate"
  | "conflict"
  | "missing-evidence"
  | "malformed"
  | "unclassifiable";

export interface LegacyEventRecord {
  id: string;
  data: Record<string, unknown>;
}

export interface NormalizationManifestRow {
  id: string;
  classification: LegacyClassification;
  reason: string;
  beforeHash: string;
  proposedAfterHash: string | null;
  proposed: Record<string, unknown> | null;
  /** Inline rollback payload so an approved run can be reversed deterministically. */
  rollback: Record<string, unknown>;
}

export interface EventNormalizationManifest {
  version: "event-normalization/v1";
  generatedAt: string;
  rows: NormalizationManifestRow[];
  counts: Record<LegacyClassification, number>;
  reviewedAt?: string;
  reviewedBy?: string;
}

function canonical(value: unknown): unknown {
  if (value instanceof Date) return { $date: value.toISOString() };
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return { $date: ((value as { toDate(): Date }).toDate()).toISOString() };
  }
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
  return value;
}

export function manifestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") return (value as { toDate(): Date }).toDate();
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? null : parsed;
  }
  return null;
}

function string(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function baseRow(record: LegacyEventRecord, classification: LegacyClassification, reason: string): NormalizationManifestRow {
  return { id: record.id, classification, reason, beforeHash: manifestHash(record.data), proposedAfterHash: null, proposed: null, rollback: record.data };
}

/**
 * Classifies every raw events document. Callers must pass raw snapshots; this
 * intentionally has no pre-filter that could hide malformed legacy records.
 */
export function planEventNormalization(input: {
  events: LegacyEventRecord[];
  sourceEventIds: Set<string>;
  registry: Array<{ fingerprint: string; eventId?: string }>;
  now?: Date;
}): EventNormalizationManifest {
  const rows = input.events.map((record) => {
    const title = string(record.data, "title");
    const date = toDate(record.data.date);
    const location = string(record.data, "location");
    const town = string(record.data, "town");
    const sourceId = string(record.data, "sourceId");
    const sourceEventId = string(record.data, "sourceEventId");
    if (!title || !date || !location || !town) return baseRow(record, "malformed", "missing-required-public-facts");
    if (!sourceId || !sourceEventId) return baseRow(record, "missing-evidence", "missing-source-identity");
    if (sourceId !== "manual-admin" && !input.sourceEventIds.has(record.id)) return baseRow(record, "missing-evidence", "missing-source-evidence");
    return { record, title, date, location, town, sourceId, sourceEventId };
  });

  const fingerprints = new Map<string, string[]>();
  for (const row of rows) {
    if (!("record" in row)) continue;
    const fingerprint = eventIdentityFingerprint(row).hash;
    fingerprints.set(fingerprint, [...(fingerprints.get(fingerprint) ?? []), row.record.id]);
  }
  const registry = new Map(input.registry.map((entry) => [entry.fingerprint, entry]));
  const manifestRows = rows.map((row): NormalizationManifestRow => {
    if (!("record" in row)) return row;
    const fingerprint = eventIdentityFingerprint(row);
    const duplicateIds = fingerprints.get(fingerprint.hash) ?? [];
    if (duplicateIds.length > 1) return baseRow(row.record, "duplicate", `duplicate-fingerprint:${duplicateIds.sort().join(",")}`);
    const existingFingerprint = string(row.record.data, "identityFingerprint");
    const claimed = registry.get(fingerprint.hash)?.eventId;
    if ((existingFingerprint && existingFingerprint !== fingerprint.hash) || (claimed && claimed !== row.record.id)) {
      return baseRow(row.record, "conflict", existingFingerprint ? "identity-fingerprint-conflict" : "registry-claim-conflict");
    }
    const proposed: Record<string, unknown> = {
      ...row.record.data,
      title: row.title,
      date: row.date,
      location: row.location,
      town: row.town,
      category: normalizeCategory(string(row.record.data, "category") ?? undefined),
      status: ["cancelled", "postponed", "rescheduled", "weather-dependent"].includes(string(row.record.data, "status") ?? "") ? row.record.data.status : "scheduled",
      availability: ["available", "registration-required", "waitlist", "sold-out", "unknown"].includes(string(row.record.data, "availability") ?? "") ? row.record.data.availability : "unknown",
      publicationStatus: row.record.data.publicationStatus === "suppressed" || row.record.data.publicationStatus === "review-held" ? row.record.data.publicationStatus : "published",
      freshnessStatus: ["current", "missing", "stale"].includes(string(row.record.data, "freshnessStatus") ?? "") ? row.record.data.freshnessStatus : "current",
      sourceId: row.sourceId,
      sourceEventId: row.sourceEventId,
      identityFingerprint: fingerprint.hash,
      identityEvidence: fingerprint.evidence,
      provenance: row.record.data.provenance === "manual" ? "manual" : "crawler",
      factEvidence: row.record.data.factEvidence && typeof row.record.data.factEvidence === "object" ? row.record.data.factEvidence : {},
    };
    return {
      id: row.record.id,
      classification: "ready",
      reason: "normalizable-with-source-evidence",
      beforeHash: manifestHash(row.record.data),
      proposedAfterHash: manifestHash(proposed),
      proposed,
      rollback: row.record.data,
    };
  });
  const counts = Object.fromEntries((["ready", "duplicate", "conflict", "missing-evidence", "malformed", "unclassifiable"] as LegacyClassification[])
    .map((classification) => [classification, manifestRows.filter((row) => row.classification === classification).length])) as Record<LegacyClassification, number>;
  return { version: "event-normalization/v1", generatedAt: (input.now ?? new Date()).toISOString(), rows: manifestRows.sort((a, b) => a.id.localeCompare(b.id)), counts };
}

export function canApplyNormalizationManifest(manifest: EventNormalizationManifest): boolean {
  return Boolean(manifest.reviewedAt && manifest.reviewedBy) && manifest.rows.length > 0 && manifest.rows.every((row) => row.classification === "ready");
}
