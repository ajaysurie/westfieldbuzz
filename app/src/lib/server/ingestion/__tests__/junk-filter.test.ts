import { describe, expect, it } from "vitest";
import {
  DEFAULT_JUNK_TITLE_PATTERNS,
  compileJunkMatchers,
  junkPatternsFromConfig,
  matchesJunk,
} from "../junk-filter";

const matchers = compileJunkMatchers(DEFAULT_JUNK_TITLE_PATTERNS);
const isJunk = (title: string) => matchesJunk(title, matchers);

describe("default junk filter", () => {
  it("strips governance and administrative entries", () => {
    for (const title of [
      "Board Meeting",
      "Board of Education Meeting",
      "Planning Board Regular Meeting",
      "Township Council Public Meeting",
      "Zoning Board Work Session",
      "Staff In-Service Day",
      "Staff In-Services",
      "In-Service",
      "Student Early Dismissal (PK-12)",
      "Teachers & Paraprofessionals Return",
      "Municipal Offices Closed - Thanksgiving",
      "Zone 1 Recycling",
      "Bulk Pickup Ward 4",
    ]) {
      expect(isJunk(title), title).toBe(true);
    }
  });

  it("keeps real events, including ones with school or civic words", () => {
    for (const title of [
      "Back to School Night",
      "Elementary Schools - Back to School Night",
      "FestiFall by The Chamber of Commerce",
      "Sweet Sounds Downtown Music Series",
      "Community Blood Drive",
      "Downtown Farmers Market",
      "Toddler Storytime",
      "Historic District Walking Tour",
      "September 11 Remembrance Ceremony",
      "Tree Lighting",
    ]) {
      expect(isJunk(title), title).toBe(false);
    }
  });

  it("treats a blank title as junk", () => {
    expect(isJunk("   ")).toBe(true);
  });
});

describe("junkPatternsFromConfig", () => {
  it("defaults when unset", () => {
    expect(junkPatternsFromConfig(undefined).patterns).toBe(DEFAULT_JUNK_TITLE_PATTERNS);
  });

  it("accepts a custom list and drops invalid entries", () => {
    const { patterns, warnings } = junkPatternsFromConfig(["\\bparade\\b", 5, "(unclosed"]);
    expect(patterns).toEqual(["\\bparade\\b"]);
    expect(warnings).toHaveLength(2);
  });

  it("allows an explicit empty list to disable shared filtering", () => {
    const { patterns, warnings } = junkPatternsFromConfig([]);
    expect(patterns).toEqual([]);
    expect(warnings).toHaveLength(0);
    expect(matchesJunk("Board Meeting", compileJunkMatchers(patterns))).toBe(false);
  });

  it("warns and defaults on a non-array", () => {
    const { patterns, warnings } = junkPatternsFromConfig("board meeting");
    expect(patterns).toBe(DEFAULT_JUNK_TITLE_PATTERNS);
    expect(warnings).toHaveLength(1);
  });
});
