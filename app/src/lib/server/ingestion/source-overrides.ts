import type { Firestore } from "firebase-admin/firestore";
import { EVENT_SOURCES, type SourceGroup } from "./source-registry";
import type { EventSourcePolicy } from "./types";

/**
 * Operator-tunable fields for one source, stored in Firestore.
 *
 * Only fields that are safe for an operator to flip live here. The security
 * boundary of a crawler is its target URL and allowed hosts, so those stay in
 * code and can never be overridden from data; nobody should be able to repoint
 * a crawler at an arbitrary host through the admin panel. What an operator does
 * control is trust and reach: whether a source auto-publishes, whether it runs
 * at all, and the junk-title patterns applied to it.
 */
export interface SourceOverride {
  autoApprove?: boolean;
  enabled?: boolean;
  junkTitlePatterns?: string[];
}

export interface ResolvedSource extends EventSourcePolicy {
  /** A disabled source is skipped by the runner but stays visible to admins. */
  enabled: boolean;
}

/**
 * The code registry is the seed and the security floor. Firestore
 * `config/sources` overlays operator choices on top, keyed by source id.
 *
 * A missing document, an unreadable one, or a malformed entry falls back to the
 * code defaults, because the crawler must keep working even when its tuning
 * layer is absent.
 */
export async function loadResolvedSources(db: Firestore): Promise<{
  sources: ResolvedSource[];
  warnings: string[];
}> {
  const overrides = await readOverrides(db);
  const sources = EVENT_SOURCES.map((source) => applyOverride(source, overrides.map[source.id]));
  return { sources, warnings: overrides.warnings };
}

export async function resolvedSourcesForGroup(
  db: Firestore,
  group: SourceGroup
): Promise<{ sources: ResolvedSource[]; warnings: string[] }> {
  const all = await loadResolvedSources(db);
  return {
    sources: all.sources.filter((source) => source.group === group && source.enabled),
    warnings: all.warnings,
  };
}

function applyOverride(source: EventSourcePolicy, override?: SourceOverride): ResolvedSource {
  return {
    ...source,
    autoApprove: typeof override?.autoApprove === "boolean" ? override.autoApprove : source.autoApprove,
    enabled: typeof override?.enabled === "boolean" ? override.enabled : true,
    junkTitlePatterns: Array.isArray(override?.junkTitlePatterns)
      ? override.junkTitlePatterns.filter((pattern): pattern is string => typeof pattern === "string")
      : source.junkTitlePatterns,
  };
}

async function readOverrides(db: Firestore): Promise<{
  map: Record<string, SourceOverride>;
  warnings: string[];
}> {
  try {
    const snapshot = await db.collection("config").doc("sources").get();
    if (!snapshot.exists) return { map: {}, warnings: [] };
    return parseOverrides(snapshot.data()?.overrides);
  } catch (error) {
    return {
      map: {},
      warnings: [`Source overrides unavailable, using code defaults: ${
        error instanceof Error ? error.message : String(error)
      }`],
    };
  }
}

export function parseOverrides(value: unknown): {
  map: Record<string, SourceOverride>;
  warnings: string[];
} {
  const map: Record<string, SourceOverride> = {};
  const warnings: string[] = [];
  if (!value || typeof value !== "object") {
    if (value !== undefined) warnings.push("Ignored malformed source overrides");
    return { map, warnings };
  }
  const knownIds = new Set(EVENT_SOURCES.map((source) => source.id));
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!knownIds.has(id)) { warnings.push(`Ignored override for unknown source "${id}"`); continue; }
    if (!raw || typeof raw !== "object") { warnings.push(`Ignored malformed override for "${id}"`); continue; }
    const record = raw as Record<string, unknown>;
    const override: SourceOverride = {};
    if (typeof record.autoApprove === "boolean") override.autoApprove = record.autoApprove;
    if (typeof record.enabled === "boolean") override.enabled = record.enabled;
    if (Array.isArray(record.junkTitlePatterns)) {
      override.junkTitlePatterns = record.junkTitlePatterns.filter(
        (pattern): pattern is string => typeof pattern === "string"
      );
    }
    map[id] = override;
  }
  return { map, warnings };
}
