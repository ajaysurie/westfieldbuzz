import type { Firestore } from "firebase-admin/firestore";
import {
  DEFAULT_LOCATION_POLICY,
  locationPolicyFromConfig,
  type LocationPolicy,
} from "./location-guard";

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
export interface CommunityConfig {
  location: LocationPolicy;
  warnings: string[];
}

export const DEFAULT_COMMUNITY_CONFIG: CommunityConfig = {
  location: DEFAULT_LOCATION_POLICY,
  warnings: [],
};

export async function loadCommunityConfig(db: Firestore): Promise<CommunityConfig> {
  try {
    const snapshot = await db.collection("config").doc("community").get();
    if (!snapshot.exists) return DEFAULT_COMMUNITY_CONFIG;
    const data = snapshot.data() ?? {};
    const { policy, warnings } = locationPolicyFromConfig(data);
    return { location: policy, warnings };
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
