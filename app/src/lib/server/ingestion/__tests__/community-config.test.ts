import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import {
  DEFAULT_COMMUNITY_CONFIG,
  DEFAULT_HORIZON_DAYS,
  loadCommunityConfig,
} from "../community-config";
import {
  DEFAULT_RADIUS_MILES,
  checkLocation,
  locationPolicyFromConfig,
} from "../location-guard";

function db(doc: { exists: boolean; data?: () => unknown } | Error): Firestore {
  return {
    collection: () => ({
      doc: () => ({
        get: async () => {
          if (doc instanceof Error) throw doc;
          return doc;
        },
      }),
    }),
  } as unknown as Firestore;
}

describe("locationPolicyFromConfig", () => {
  it("serves a different community when the origin is overridden", () => {
    // Nothing about the guard is Westfield-specific; move the origin and the
    // same code serves another town.
    const { policy } = locationPolicyFromConfig({
      origin: { latitude: 40.7357, longitude: -74.1724 }, // Newark
      radiusMiles: 5,
    });

    expect(checkLocation({ location: "Newark NJ", policy }).status).toBe("within");
    expect(checkLocation({ location: "Westfield NJ", policy }).status).toBe("too-far");
  });

  it("widens or narrows the radius from config", () => {
    const wide = locationPolicyFromConfig({ radiusMiles: 25 }).policy;
    expect(checkLocation({ location: "Newark NJ", policy: wide }).status).toBe("within");

    const tight = locationPolicyFromConfig({ radiusMiles: 2 }).policy;
    expect(checkLocation({ location: "Summit NJ", policy: tight }).status).toBe("too-far");
  });

  it("adds a venue without touching code", () => {
    const { policy } = locationPolicyFromConfig({
      places: { "the rialto": { latitude: 40.6512, longitude: -74.3487 } },
    });

    expect(checkLocation({ location: "The Rialto, main stage", policy }).status).toBe("within");
    // Built-ins still resolve alongside the addition.
    expect(checkLocation({ location: "Cranford NJ", policy }).status).toBe("within");
  });

  it("lets config override a built-in place by name", () => {
    const { policy } = locationPolicyFromConfig({
      places: { cranford: { latitude: 40.6782, longitude: -73.9442 } }, // moved to Brooklyn
    });
    expect(checkLocation({ location: "Cranford NJ", policy }).status).toBe("too-far");
  });

  it("ignores malformed values instead of failing, and says which", () => {
    const { policy, warnings } = locationPolicyFromConfig({
      origin: { latitude: "north", longitude: 0 },
      radiusMiles: -4,
      places: { broken: { latitude: 999, longitude: 0 } },
    });

    expect(policy.radiusMiles).toBe(DEFAULT_RADIUS_MILES);
    expect(checkLocation({ location: "Westfield NJ", policy }).status).toBe("within");
    expect(warnings).toHaveLength(3);
  });

  it("falls back cleanly on an empty config", () => {
    const { policy, warnings } = locationPolicyFromConfig({});
    expect(policy.radiusMiles).toBe(DEFAULT_RADIUS_MILES);
    expect(warnings).toHaveLength(0);
  });
});

describe("ingestion horizon", () => {
  it("defaults far enough ahead to include a town's marquee events", async () => {
    // A 30 day window discarded FestiFall by one day, plus the Christmas Tree
    // Lighting, Small Business Saturday, and the Menorah Lighting.
    const config = await loadCommunityConfig(db({ exists: false }));
    expect(config.horizonDays).toBe(DEFAULT_HORIZON_DAYS);
    expect(config.horizonDays).toBeGreaterThanOrEqual(120);
  });

  it("takes a configured horizon", async () => {
    const config = await loadCommunityConfig(db({ exists: true, data: () => ({ horizonDays: 45 }) }));
    expect(config.horizonDays).toBe(45);
  });

  it("rejects a horizon that is zero, negative, or absurd", async () => {
    for (const horizonDays of [0, -10, 5000, "soon"]) {
      const config = await loadCommunityConfig(db({ exists: true, data: () => ({ horizonDays }) }));
      expect(config.horizonDays, String(horizonDays)).toBe(DEFAULT_HORIZON_DAYS);
      expect(config.warnings.join(" ")).toContain("horizonDays");
    }
  });
});

describe("loadCommunityConfig", () => {
  it("uses defaults when no document exists", async () => {
    const config = await loadCommunityConfig(db({ exists: false }));
    expect(config).toEqual(DEFAULT_COMMUNITY_CONFIG);
  });

  it("applies a stored override", async () => {
    const config = await loadCommunityConfig(
      db({ exists: true, data: () => ({ radiusMiles: 3 }) })
    );
    expect(config.location.radiusMiles).toBe(3);
  });

  it("degrades to defaults and warns when Firestore is unavailable", async () => {
    // Config is an optimisation over the defaults, never a dependency; a read
    // failure must not take ingestion down.
    const config = await loadCommunityConfig(db(new Error("permission denied")));
    expect(config.location.radiusMiles).toBe(DEFAULT_RADIUS_MILES);
    expect(config.warnings.join(" ")).toContain("using defaults");
  });
});
