import { describe, expect, it } from "vitest";
import {
  normalizeCategory,
  normalizeEndDate,
  normalizeEventFacts,
  normalizeLocation,
  normalizeWhitespace,
} from "../normalize";
import type { EventFacts } from "../types";

function facts(overrides: Partial<EventFacts> = {}): EventFacts {
  return {
    title: "Sample Event",
    description: "A description.",
    date: new Date("2026-09-19T23:30:00.000Z"),
    endDate: new Date("2026-09-20T01:30:00.000Z"),
    location: "Galeria, 111 Quimby St",
    town: "Westfield",
    category: "Community",
    status: "scheduled",
    availability: "unknown",
    sourceId: "test-source",
    sourceEventId: "test-1",
    sourceUrl: "https://example.com/event",
    ...overrides,
  };
}

describe("event normalization", () => {
  it("maps legacy and ingested categories to one taxonomy", () => {
    expect(normalizeCategory("Family")).toBe("Family & Kids");
    expect(normalizeCategory("Arts")).toBe("Arts & Culture");
    expect(normalizeCategory("Sports")).toBe("Sports & Recreation");
    expect(normalizeCategory("Food")).toBe("Food & Drink");
    expect(normalizeCategory("Unknown legacy label")).toBe("Community");
  });

  it("normalizes whitespace without changing content", () => {
    expect(normalizeWhitespace("  Family   story\n time  ")).toBe(
      "Family story time"
    );
  });

  it("strips leading list markers from venue names", () => {
    expect(normalizeLocation("- 1025 Orange Avenue Cranford NJ 07016")).toBe(
      "1025 Orange Avenue Cranford NJ 07016"
    );
    expect(normalizeLocation("– Westfield NJ 07090")).toBe("Westfield NJ 07090");
    expect(normalizeLocation("Galeria, 111 Quimby St")).toBe(
      "Galeria, 111 Quimby St"
    );
    expect(normalizeLocation("")).toBe("");
  });

  it("drops end dates that are not after the start", () => {
    const start = new Date("2026-09-19T23:30:00.000Z");
    // Feeds with no end time echo the start ("8:00 PM–8:00 PM").
    expect(normalizeEndDate(start, new Date(start.getTime()))).toBeNull();
    expect(
      normalizeEndDate(start, new Date(start.getTime() - 60_000))
    ).toBeNull();
    expect(normalizeEndDate(start, null)).toBeNull();
    const end = new Date("2026-09-20T01:30:00.000Z");
    expect(normalizeEndDate(start, end)).toBe(end);
  });

  it("normalizeEventFacts cleans venue artifacts and zero-duration events", () => {
    const normalized = normalizeEventFacts(
      facts({
        location: "- 1025 Orange Avenue Cranford NJ 07016",
        endDate: new Date("2026-09-19T23:30:00.000Z"),
      })
    );
    expect(normalized.location).toBe("1025 Orange Avenue Cranford NJ 07016");
    expect(normalized.endDate).toBeNull();
  });
});
