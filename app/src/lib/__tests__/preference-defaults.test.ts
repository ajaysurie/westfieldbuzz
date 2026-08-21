import { describe, expect, it, vi } from "vitest";

// personalization.ts touches the Firebase client at import time for its saved-
// search helpers; the function under test is pure and needs none of it.
vi.mock("@/lib/firebase", () => ({ db: {}, auth: {} }));
import { applyPreferenceDefaults } from "../preference-defaults";
import { EMPTY_PREFERENCES, type HouseholdPreferences } from "../personalization";
import { fallbackParseIntent } from "../search/event-intent";

const now = new Date("2026-08-20T12:00:00-04:00");

function intentFor(query: string) {
  return fallbackParseIntent({ query, priorIntent: null, now });
}

const family: HouseholdPreferences = {
  ...EMPTY_PREFERENCES,
  towns: ["Westfield", "Cranford"],
  driveMinutes: 20,
  childAges: [4, 7],
  interests: ["Family & Kids"],
  budgetMax: 25,
};

describe("applyPreferenceDefaults", () => {
  it("fills unstated constraints from saved preferences", () => {
    const { intent, appliedFields } = applyPreferenceDefaults(intentFor("something fun this weekend"), family);
    expect(intent.partyAges).toEqual([4, 7]);
    expect(intent.towns).toEqual(["Westfield", "Cranford"]);
    expect(intent.maxDriveMinutes).toBe(20);
    expect(intent.budget).toEqual({ freeOnly: false, maxAmount: 25 });
    expect(appliedFields).toEqual(["ages", "towns", "drive time", "budget"]);
  });

  it("never overrides what the sentence stated", () => {
    const stated = intentFor("events for a 12 year old in Summit");
    // guard the premise: the fallback parser extracted these
    expect(stated.partyAges).toContain(12);
    const { intent } = applyPreferenceDefaults(stated, family);
    expect(intent.partyAges).toContain(12);
    expect(intent.partyAges).not.toContain(4);
  });

  it("does not default interests or environment, which are ranking signals", () => {
    const { intent } = applyPreferenceDefaults(intentFor("anything this weekend"), family);
    expect(intent.categories).toEqual([]);
    expect(intent.environment).toBeNull();
  });

  it("is a no-op with no preferences and reports nothing applied", () => {
    const base = intentFor("anything this weekend");
    const { intent, appliedFields } = applyPreferenceDefaults(base, null);
    expect(intent).toBe(base);
    expect(appliedFields).toEqual([]);
  });
});
