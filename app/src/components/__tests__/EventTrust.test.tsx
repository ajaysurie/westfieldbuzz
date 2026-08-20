import { describe, expect, it } from "vitest";
import type { Timestamp } from "firebase/firestore";
import type { Event } from "@/lib/firestore";
import { buildCalendarFile } from "../CalendarExport";
import { getEventStatusPresentation } from "../EventStatusBadge";

const timestamp = (date: string) => ({ toDate: () => new Date(date) } as Timestamp);

describe("event trust presentation", () => {
  it("prioritizes cancellation and sold-out states", () => {
    expect(getEventStatusPresentation({ status: "cancelled", availability: "sold-out" }).label).toBe("Cancelled");
    expect(getEventStatusPresentation({ status: "scheduled", availability: "sold-out" }).label).toBe("Sold out");
    expect(getEventStatusPresentation({ status: "weather-dependent" }).label).toBe("Weather dependent");
  });

  it("builds a timezone-aware calendar export with source provenance", () => {
    const event = {
      id: "evt-1",
      title: "Music, Mocktails & More",
      description: "An evening downtown.",
      date: timestamp("2026-08-21T23:00:00Z"),
      endDate: timestamp("2026-08-22T01:00:00Z"),
      location: "Mindowaskin Park",
      town: "Westfield",
      sourceUrl: "https://example.com/event",
    } as Event;
    const calendar = buildCalendarFile(event, new Date("2026-08-20T12:00:00Z"));
    expect(calendar).toContain("DTSTART;TZID=America/New_York:20260821T190000");
    expect(calendar).toContain("SUMMARY:Music\\, Mocktails & More");
    expect(calendar).toContain("Source: https://example.com/event");
    expect(calendar).toContain("URL:https://westfieldbuzz.com/events/evt-1");
  });
});
