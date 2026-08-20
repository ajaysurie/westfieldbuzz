import type { Firestore } from "firebase-admin/firestore";
import {
  DEFAULT_LOCATION_POLICY,
  locationPolicyFromConfig,
  type LocationPolicy,
} from "./location-guard";
import {
  DEFAULT_JUNK_TITLE_PATTERNS,
  junkPatternsFromConfig,
} from "./junk-filter";

/**
 * Runtime configuration for the community this deployment serves.
 *
 * Stored at `config/community` so the origin, radius, and extra places can be
 * tuned without a code change or a deploy. Code supplies defaults; Firestore
 * overrides them. A missing document, an unreadable one, or a malformed field
 * all degrade to the defaults rather than taking ingestion down.
 *
 * Example document:
 *   {
 *     "origin": { "latitude": 40.6590, "longitude": -74.3474 },
 *     "radiusMiles": 10,
 *     "places": { "the rialto": { "latitude": 40.6512, "longitude": -74.3487 } }
 *   }
 */
/**
 * How far ahead ingestion looks.
 *
 * The previous hard-coded 30 days silently discarded a town's marquee events:
 * the Downtown Westfield feed carries FestiFall, the Christmas Tree Lighting,
 * Small Business Saturday, and the Hanukkah Menorah Lighting, and every one of
 * them fell outside the window. FestiFall missed by a single day. A community
 * calendar is a planning tool, so it has to see the season, not the fortnight.
 */
export const DEFAULT_HORIZON_DAYS = 120;

export interface CommunityConfig {
  location: LocationPolicy;
  /** Days ahead of now that ingestion should collect. */
  horizonDays: number;
  /** Cross-source title patterns that mark an entry as not a real event. */
  junkTitlePatterns: string[];
  warnings: string[];
}

export const DEFAULT_COMMUNITY_CONFIG: CommunityConfig = {
  location: DEFAULT_LOCATION_POLICY,
  horizonDays: DEFAULT_HORIZON_DAYS,
  junkTitlePatterns: DEFAULT_JUNK_TITLE_PATTERNS,
  warnings: [],
};

function horizonFromConfig(value: unknown): { days: number; warning?: string } {
  if (value === undefined) return { days: DEFAULT_HORIZON_DAYS };
  const days = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : null;
  // Two years is well past any published community calendar; beyond that a
  // configuration slip would balloon every run.
  if (days === null || days < 1 || days > 730) {
    return { days: DEFAULT_HORIZON_DAYS, warning: "Ignored invalid horizonDays" };
  }
  return { days };
}

export async function loadCommunityConfig(db: Firestore): Promise<CommunityConfig> {
  try {
    const snapshot = await db.collection("config").doc("community").get();
    if (!snapshot.exists) return DEFAULT_COMMUNITY_CONFIG;
    const data = snapshot.data() ?? {};
    const { policy, warnings } = locationPolicyFromConfig(data);
    const horizon = horizonFromConfig((data as Record<string, unknown>).horizonDays);
    const junk = junkPatternsFromConfig((data as Record<string, unknown>).junkTitlePatterns);
    return {
      location: policy,
      horizonDays: horizon.days,
      junkTitlePatterns: junk.patterns,
      warnings: [...warnings, ...(horizon.warning ? [horizon.warning] : []), ...junk.warnings],
    };
  } catch (error) {
    // Configuration is an optimisation over the defaults, never a dependency.
    return {
      ...DEFAULT_COMMUNITY_CONFIG,
      warnings: [`Community config unavailable, using defaults: ${
        error instanceof Error ? error.message : String(error)
      }`],
    };
  }
}
