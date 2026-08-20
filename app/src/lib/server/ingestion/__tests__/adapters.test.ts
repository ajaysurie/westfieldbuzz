import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deduplicateObservations,
  fetchSourceEvents,
  parseICalPayload,
  parseMecHtml,
  parseSquarespacePayload,
  parseTribePayload,
} from "../adapters";
import { sourceById } from "../source-registry";
import { makeIngestionWindow } from "../runner";

const fixtures = join(__dirname, "fixtures");
const window = makeIngestionWindow({
  fromLocalDate: "2026-08-01",
  toLocalDate: "2026-10-31",
});

function fixture(path: string): string {
  return readFileSync(join(fixtures, path), "utf8");
}

function source(id: string) {
  const value = sourceById(id);
  if (!value) throw new Error(`Missing test source: ${id}`);
  return value;
}

describe("approved source adapters", () => {
  it("parses the school iCal fixture with local time and attribution", () => {
    const parsed = parseICalPayload(
      source("westfield-schools-ical"),
      fixture("ical/success.ics"),
      window
    );
    expect(parsed.layoutValid).toBe(true);
    expect(parsed.errors).toEqual([]);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]).toMatchObject({
      sourceEventId: "school-123",
      town: "Westfield",
      title: "New Family Welcome",
    });
    expect(parsed.events[0].date.toISOString()).toBe("2026-08-22T14:00:00.000Z");
  });

  it("keeps a moved recurring override on its original slot and uses override facts", () => {
    const parsed = parseICalPayload(
      source("westfield-schools-ical"),
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:series-1",
        "DTSTART:20260822T140000Z",
        "DTEND:20260822T150000Z",
        "RRULE:FREQ=WEEKLY;COUNT=2",
        "SUMMARY:Base story time",
        "DESCRIPTION:Base description",
        "LOCATION:Base library",
        "CATEGORIES:Family",
        "URL:https://example.com/base",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:series-1",
        "RECURRENCE-ID:20260829T140000Z",
        "DTSTART:20260829T160000Z",
        "DTEND:20260829T170000Z",
        "SUMMARY:Moved and cancelled story time",
        "DESCRIPTION:Override description",
        "LOCATION:Override library",
        "CATEGORIES:Music",
        "STATUS:CANCELLED",
        "URL:https://example.com/override",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
      window
    );
    const moved = parsed.events.find((event) => event.title === "Moved and cancelled story time");
    const generated = parsed.events.find((event) => event.title === "Base story time");

    expect(generated).toMatchObject({
      sourceEventId: "series-1:2026-08-22T14:00:00.000Z",
      date: new Date("2026-08-22T14:00:00.000Z"),
      endDate: new Date("2026-08-22T15:00:00.000Z"),
    });
    expect(parsed.events.map((event) => event.date.toISOString()).sort()).toEqual([
      "2026-08-22T14:00:00.000Z",
      "2026-08-29T16:00:00.000Z",
    ]);

    expect(moved).toMatchObject({
      sourceEventId: "series-1:2026-08-29T14:00:00.000Z",
      sourceEventAliases: ["series-1:2026-08-29T16:00:00.000Z"],
      date: new Date("2026-08-29T16:00:00.000Z"),
      endDate: new Date("2026-08-29T17:00:00.000Z"),
      description: "Override description",
      location: "Override library",
      sourceUrl: "https://example.com/override",
      category: "Music",
      status: "cancelled",
    });
  });

  it("distinguishes an empty iCal from a broken envelope", () => {
    const policy = source("westfield-schools-ical");
    const empty = parseICalPayload(policy, fixture("ical/empty.ics"), window);
    const broken = parseICalPayload(policy, fixture("ical/layout-break.txt"), window);
    expect(empty).toMatchObject({ layoutValid: true, events: [] });
    expect(broken.layoutValid).toBe(false);
  });

  it("reports malformed iCal dates without publishing them", () => {
    const parsed = parseICalPayload(
      source("westfield-schools-ical"),
      fixture("ical/malformed-date.ics"),
      window
    );
    expect(parsed.events).toEqual([]);
    expect(parsed.errors.length).toBeGreaterThan(0);
  });

  it("parses Squarespace success and accepts a known empty collection", () => {
    const policy = source("rialto-squarespace");
    const success = parseSquarespacePayload(
      policy,
      JSON.parse(fixture("squarespace/success.json")),
      window
    );
    const empty = parseSquarespacePayload(
      policy,
      JSON.parse(fixture("squarespace/empty.json")),
      window
    );
    expect(success.events[0]).toMatchObject({
      title: "Community Film Night",
      location: "Rialto Center",
      category: "Arts & Culture",
    });
    expect(empty).toMatchObject({ layoutValid: true, events: [], errors: [] });
  });

  it("fails Squarespace layout and malformed-date fixtures", () => {
    const policy = source("rialto-squarespace");
    const layout = parseSquarespacePayload(
      policy,
      JSON.parse(fixture("squarespace/layout-break.json")),
      window
    );
    const malformed = parseSquarespacePayload(
      policy,
      JSON.parse(fixture("squarespace/malformed-date.json")),
      window
    );
    expect(layout.layoutValid).toBe(false);
    expect(malformed.errors).toHaveLength(1);
  });

  it("deduplicates a Squarespace duplicate fixture by source ID", () => {
    const policy = source("rialto-squarespace");
    const parsed = parseSquarespacePayload(
      policy,
      JSON.parse(fixture("squarespace/duplicate.json")),
      window
    );
    const unique = deduplicateObservations(policy, parsed.events);
    expect(unique.events).toHaveLength(1);
    expect(unique.warnings[0]).toContain("duplicate source event ID");
  });

  it("parses MEC cards and detects empty, broken, malformed, and duplicate fixtures", () => {
    const policy = source("downtown-cranford-mec");
    const success = parseMecHtml(policy, fixture("mec/success.html"), window);
    const empty = parseMecHtml(policy, fixture("mec/empty.html"), window);
    const broken = parseMecHtml(policy, fixture("mec/layout-break.html"), window);
    const malformed = parseMecHtml(policy, fixture("mec/malformed-date.html"), window);
    const duplicates = parseMecHtml(policy, fixture("mec/duplicate.html"), window);
    expect(success.events[0]).toMatchObject({
      title: "Storytime with Fire & Police",
      location: "Downtown Gazebo",
      sourceEventId: "2839",
    });
    expect(success.events[0].date.toISOString()).toBe("2026-08-22T14:00:00.000Z");
    expect(empty).toMatchObject({ layoutValid: true, events: [] });
    expect(broken.layoutValid).toBe(false);
    expect(malformed.errors).toHaveLength(1);
    expect(deduplicateObservations(policy, duplicates.events).events).toHaveLength(1);
  });

  it("parses Tribe JSON and detects empty, broken, malformed, and duplicate fixtures", () => {
    const policy = source("ucpac-tribe");
    const success = parseTribePayload(
      policy,
      JSON.parse(fixture("tribe/success.json")),
      window
    );
    const empty = parseTribePayload(
      policy,
      JSON.parse(fixture("tribe/empty.json")),
      window
    );
    const broken = parseTribePayload(
      policy,
      JSON.parse(fixture("tribe/layout-break.json")),
      window
    );
    const malformed = parseTribePayload(
      policy,
      JSON.parse(fixture("tribe/malformed-date.json")),
      window
    );
    const duplicates = parseTribePayload(
      policy,
      JSON.parse(fixture("tribe/duplicate.json")),
      window
    );
    expect(success.events[0]).toMatchObject({
      title: "Summer Concert",
      location: "UCPAC Main Stage",
      town: "Rahway",
    });
    expect(empty).toMatchObject({ layoutValid: true, events: [] });
    expect(broken.layoutValid).toBe(false);
    expect(malformed.errors).toHaveLength(1);
    expect(deduplicateObservations(policy, duplicates.events).events).toHaveLength(1);
  });

  it("marks a layout break incomplete before reconciliation can age events", async () => {
    const policy = source("rialto-squarespace");
    const result = await fetchSourceEvents({
      source: policy,
      window,
      fetchImpl: async () =>
        new Response(fixture("squarespace/layout-break.json"), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    expect(result.complete).toBe(false);
    expect(result.errors).toContain("Expected source layout marker was missing");
  });
});
