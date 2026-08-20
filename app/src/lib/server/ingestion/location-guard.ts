/**
 * Distance guard for ingested observations.
 *
 * The pipeline stamps `town` from source configuration, not from the event, so
 * a regional listing page will happily produce a Brooklyn concert filed under
 * Westfield. A live check against an aggregator returned exactly that. This
 * module resolves the event's own stated location to coordinates and measures
 * real distance from the community's centre.
 *
 * Resolution is deliberately offline: a static gazetteer of local and nearby
 * places, plus any coordinates a source supplied directly. No geocoding API,
 * so there is no key to manage, no rate limit, and no network call in the hot
 * path. The cost is that an unrecognised place resolves to "unknown" rather
 * than a distance, which callers must decide how to treat.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Westfield's town centre, the default origin for the radius check. */
export const DEFAULT_ORIGIN: Coordinates = { latitude: 40.6590, longitude: -74.3474 };

/**
 * Events beyond this are not local, no matter what a source claims.
 *
 * Calibrated against measured distances from Westfield rather than picked. Every
 * town a resident would plausibly drive to sits at 8 miles or less (Mountainside
 * 1.1, Cranford 2.2, Summit 4.0, Metuchen 8.0). The next places up are Edison at
 * 10.3 and Newark at 10.6, which are different communities, not neighbours. Ten
 * miles lands in that gap.
 */
export const DEFAULT_RADIUS_MILES = 10;

/**
 * Approximate centroids. Nearby towns are here so their events pass; more
 * distant places are here so their events resolve and get rejected on distance
 * rather than falling into "unknown", which is a weaker signal.
 */
const BUILT_IN_PLACES: Record<string, Coordinates> = {
  // Westfield and its immediate neighbours
  "westfield": { latitude: 40.6590, longitude: -74.3474 },
  "cranford": { latitude: 40.6584, longitude: -74.3046 },
  "garwood": { latitude: 40.6515, longitude: -74.3232 },
  "scotch plains": { latitude: 40.6559, longitude: -74.3899 },
  "fanwood": { latitude: 40.6412, longitude: -74.3846 },
  "mountainside": { latitude: 40.6723, longitude: -74.3574 },
  "clark": { latitude: 40.6220, longitude: -74.3096 },
  "springfield": { latitude: 40.7048, longitude: -74.3171 },
  "summit": { latitude: 40.7156, longitude: -74.3646 },
  "berkeley heights": { latitude: 40.6829, longitude: -74.4429 },
  "new providence": { latitude: 40.6984, longitude: -74.4015 },
  "kenilworth": { latitude: 40.6767, longitude: -74.2907 },
  "roselle park": { latitude: 40.6645, longitude: -74.2643 },
  "roselle": { latitude: 40.6523, longitude: -74.2582 },
  "linden": { latitude: 40.6220, longitude: -74.2446 },
  "rahway": { latitude: 40.6081, longitude: -74.2776 },
  "elizabeth": { latitude: 40.6639, longitude: -74.2107 },
  "union": { latitude: 40.6976, longitude: -74.2632 },
  "hillside": { latitude: 40.7009, longitude: -74.2296 },
  "plainfield": { latitude: 40.6337, longitude: -74.4074 },
  "south plainfield": { latitude: 40.5793, longitude: -74.4118 },
  "watchung": { latitude: 40.6387, longitude: -74.4499 },
  "warren": { latitude: 40.6301, longitude: -74.5157 },
  "millburn": { latitude: 40.7290, longitude: -74.3021 },
  "short hills": { latitude: 40.7376, longitude: -74.3260 },
  "maplewood": { latitude: 40.7312, longitude: -74.2735 },
  "south orange": { latitude: 40.7490, longitude: -74.2610 },
  "chatham": { latitude: 40.7407, longitude: -74.3838 },
  "madison": { latitude: 40.7598, longitude: -74.4171 },
  "metuchen": { latitude: 40.5432, longitude: -74.3632 },
  "edison": { latitude: 40.5187, longitude: -74.4121 },
  "woodbridge": { latitude: 40.5576, longitude: -74.2846 },
  // Far enough to be rejected, listed so they resolve rather than read unknown
  "newark": { latitude: 40.7357, longitude: -74.1724 },
  "jersey city": { latitude: 40.7178, longitude: -74.0431 },
  "hoboken": { latitude: 40.7440, longitude: -74.0324 },
  "morristown": { latitude: 40.7968, longitude: -74.4815 },
  "new brunswick": { latitude: 40.4862, longitude: -74.4518 },
  "staten island": { latitude: 40.5795, longitude: -74.1502 },
  "brooklyn": { latitude: 40.6782, longitude: -73.9442 },
  "queens": { latitude: 40.7282, longitude: -73.7949 },
  "bronx": { latitude: 40.8448, longitude: -73.8648 },
  "manhattan": { latitude: 40.7831, longitude: -73.9712 },
  "new york": { latitude: 40.7831, longitude: -73.9712 },
  "nyc": { latitude: 40.7831, longitude: -73.9712 },
  "philadelphia": { latitude: 39.9526, longitude: -75.1652 },
};

const EARTH_RADIUS_MILES = 3958.8;

export interface LocationPolicy {
  /** Centre of the community this deployment serves. */
  origin: Coordinates;
  /** Events further than this from the origin are not local. */
  radiusMiles: number;
  /** Place name to centroid. Callers may extend or override the built-ins. */
  places: Record<string, Coordinates>;
}

/**
 * Westfield defaults. These are a starting point, not a constraint: every field
 * is overridable through `config/community` in Firestore, so serving a different
 * town, widening the radius, or adding a venue is configuration rather than a
 * code change and a deploy.
 */
export const DEFAULT_LOCATION_POLICY: LocationPolicy = {
  origin: DEFAULT_ORIGIN,
  radiusMiles: DEFAULT_RADIUS_MILES,
  places: BUILT_IN_PLACES,
};

export function distanceMiles(a: Coordinates, b: Coordinates): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Longest-first ordering matters: "south orange" and "roselle park" must not be
 * shadowed by "orange" or "roselle". Cached per places table so a custom
 * gazetteer does not re-sort on every observation.
 */
const keyOrderCache = new WeakMap<Record<string, Coordinates>, string[]>();

function orderedKeys(places: Record<string, Coordinates>): string[] {
  const cached = keyOrderCache.get(places);
  if (cached) return cached;
  const keys = Object.keys(places).sort((a, b) => b.length - a.length);
  keyOrderCache.set(places, keys);
  return keys;
}

/**
 * Word-boundary aware so "Newark Avenue" in a local address does not resolve the
 * event to Newark.
 */
export function resolvePlace(
  location: string,
  places: Record<string, Coordinates> = BUILT_IN_PLACES
): { name: string; coordinates: Coordinates } | null {
  const haystack = ` ${(location ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ")} `;
  for (const key of orderedKeys(places)) {
    if (haystack.includes(` ${key} `)) return { name: key, coordinates: places[key] };
  }
  return null;
}

export type LocationVerdict =
  | { status: "within"; miles: number; place: string }
  | { status: "too-far"; miles: number; place: string }
  | { status: "unknown" };

export function checkLocation(input: {
  location: string;
  coordinates?: Coordinates | null;
  policy?: LocationPolicy;
  /** Convenience overrides; `policy` wins when both are given. */
  origin?: Coordinates;
  radiusMiles?: number;
}): LocationVerdict {
  const policy = input.policy ?? DEFAULT_LOCATION_POLICY;
  const origin = input.policy?.origin ?? input.origin ?? policy.origin;
  const radius = input.policy?.radiusMiles ?? input.radiusMiles ?? policy.radiusMiles;

  if (input.coordinates
    && Number.isFinite(input.coordinates.latitude)
    && Number.isFinite(input.coordinates.longitude)) {
    const miles = distanceMiles(origin, input.coordinates);
    return miles <= radius
      ? { status: "within", miles, place: "source-coordinates" }
      : { status: "too-far", miles, place: "source-coordinates" };
  }

  const resolved = resolvePlace(input.location ?? "", policy.places);
  if (!resolved) return { status: "unknown" };
  const miles = distanceMiles(origin, resolved.coordinates);
  return miles <= radius
    ? { status: "within", miles, place: resolved.name }
    : { status: "too-far", miles, place: resolved.name };
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function coordinates(value: unknown): Coordinates | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const latitude = finiteNumber(record.latitude);
  const longitude = finiteNumber(record.longitude);
  if (latitude === null || longitude === null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

/**
 * Build a policy from stored configuration, falling back field by field. A
 * malformed value is ignored rather than fatal, because a bad config entry must
 * never take ingestion down; the rejected keys are returned so a caller can warn.
 */
export function locationPolicyFromConfig(config: unknown): {
  policy: LocationPolicy;
  warnings: string[];
} {
  const warnings: string[] = [];
  const record = (config && typeof config === "object" ? config : {}) as Record<string, unknown>;

  const origin = coordinates(record.origin);
  if (record.origin !== undefined && !origin) warnings.push("Ignored invalid community origin");

  const radius = finiteNumber(record.radiusMiles);
  const validRadius = radius !== null && radius > 0 && radius <= 500 ? radius : null;
  if (record.radiusMiles !== undefined && validRadius === null) {
    warnings.push("Ignored invalid community radiusMiles");
  }

  // Configured places extend the built-ins and may override one by name.
  const places: Record<string, Coordinates> = { ...BUILT_IN_PLACES };
  const configured = record.places;
  if (configured && typeof configured === "object") {
    for (const [name, value] of Object.entries(configured as Record<string, unknown>)) {
      const point = coordinates(value);
      if (!point) { warnings.push(`Ignored invalid place "${name}"`); continue; }
      places[name.toLowerCase().trim()] = point;
    }
  } else if (configured !== undefined) {
    warnings.push("Ignored invalid community places");
  }

  return {
    policy: {
      origin: origin ?? DEFAULT_ORIGIN,
      radiusMiles: validRadius ?? DEFAULT_RADIUS_MILES,
      places,
    },
    warnings,
  };
}
