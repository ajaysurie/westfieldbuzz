import { describe, expect, it } from "vitest";
import evaluation from "./fixtures/intent-evaluation.json";
import {
  fallbackParseIntent,
  sanitizeSearchQuery,
  validateSearchIntent,
} from "../event-intent";

const NOW = new Date("2026-08-19T16:00:00.000Z");

describe("deterministic event intent parsing", () => {
  it("resolves New York relative dates and household constraints", () => {
    const intent = fallbackParseIntent({ query: evaluation[0].query, now: NOW });
    expect(intent.dateWindow).toEqual({ startDate: "2026-08-22", endDate: "2026-08-22" });
    expect(intent.partyAges).toEqual([5]);
    expect(intent.environment).toBe("indoor");
    expect(intent.timeOfDay).toEqual(["morning"]);
    expect(intent.maxDriveMinutes).toBe(15);
  });

  it("merges a one-line refinement while replacing explicit fields", () => {
    const original = fallbackParseIntent({ query: evaluation[0].query, now: NOW });
    const refined = fallbackParseIntent({
      query: "Actually Sunday and free",
      priorIntent: original,
      now: NOW,
    });
    expect(refined.dateWindow).toEqual({ startDate: "2026-08-23", endDate: "2026-08-23" });
    expect(refined.budget).toEqual({ freeOnly: true, maxAmount: 0 });
    expect(refined.partyAges).toEqual([5]);
    expect(refined.environment).toBe("indoor");
    expect(refined.timeOfDay).toEqual(["morning"]);
    expect(refined.maxDriveMinutes).toBe(15);
  });

  it("turns negated sports into an exclusion", () => {
    const intent = fallbackParseIntent({ query: evaluation[1].query, now: NOW });
    expect(intent.exclusions.categories).toContain("Sports & Recreation");
    expect(intent.categories).not.toContain("Sports & Recreation");
  });

  it("surfaces ambiguous town and date language instead of guessing", () => {
    const town = fallbackParseIntent({ query: evaluation[2].query, now: NOW });
    const date = fallbackParseIntent({ query: "Saturday or Sunday", now: NOW });
    expect(town.ambiguities).toContainEqual(expect.objectContaining({ field: "town" }));
    expect(date.dateWindow).toBeNull();
    expect(date.ambiguities).toContainEqual(expect.objectContaining({ field: "date" }));
  });

  it("treats prompt-injection-like text as search data", () => {
    const intent = fallbackParseIntent({ query: evaluation[3].query, now: NOW });
    expect(intent.version).toBe(1);
    expect(intent.categories).toContain("Music");
    expect(intent.budget?.freeOnly).toBe(true);
    expect(intent.timeOfDay).toEqual(["evening"]);
  });

  it("strips markup and control characters before parsing", () => {
    expect(sanitizeSearchQuery(" <b>music</b>\u0000 Friday ")).toBe("music Friday");
  });

  it("rejects malformed prior intent at the trust boundary", () => {
    const valid = fallbackParseIntent({ query: "music", now: NOW });
    expect(validateSearchIntent(valid)).toEqual(valid);
    expect(validateSearchIntent({ ...valid, version: 2 })).toBeNull();
    expect(validateSearchIntent({ ...valid, partyAges: [-1] })).toBeNull();
  });
});
