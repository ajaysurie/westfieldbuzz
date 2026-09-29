import { describe, expect, it, vi } from "vitest";
import { handleCalendarFeed } from "@/app/calendar.ics/handler";
import type { SearchableEvent } from "@/lib/search/event-retrieval";

function stubEvent(overrides: Partial<SearchableEvent>): SearchableEvent {
  return {
    id: "evt-1", title: "Jazz Night", description: "Live jazz", date: "2026-09-20T23:00:00.000Z", endDate: null,
    location: "Galeria", town: "Westfield", category: "Music", status: "scheduled", availability: "unknown",
    publicationStatus: "published", freshnessStatus: "current", sourceUrl: "https://example.com", sourceId: "src",
    lastVerifiedAt: "2026-09-18T10:00:00Z", tags: [], minAge: null, maxAge: null, costAmount: null, isFree: null,
    environment: null, registration: null, accessibility: [], driveMinutes: null, factEvidence: {},
    ...overrides,
  };
}

function feed(path: string) {
  const repository = {
    listPublishedEvents: vi.fn(async () => [
      stubEvent({ id: "a" }),
      stubEvent({ id: "b", town: "Summit", status: "cancelled", title: "A very long event title that will need folding across more than one line" }),
    ]),
  };
  return handleCalendarFeed(new Request(`https://www.westfieldbuzz.com${path}`), {
    repository,
    now: new Date("2026-09-18T12:00:00Z"),
  });
}

describe("GET /calendar.ics", () => {
  it("returns a named, subscribable calendar", async () => {
    const response = await feed("/calendar.ics");
    const body = await response.text();

    expect(response.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(body).toContain("X-WR-CALNAME:Westfield Buzz\r\n");
    expect(body).toContain("UID:a@westfieldbuzz.com");
    expect(body).toContain("DTSTART;TZID=America/New_York:20260920T190000");
    expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it("filters with the API's params and names the feed after them", async () => {
    const body = await (await feed("/calendar.ics?town=Summit")).text();
    expect(body).toContain("X-WR-CALNAME:Westfield Buzz: Summit");
    expect(body).toContain("STATUS:CANCELLED");
    expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it("folds lines to 75 octets", async () => {
    const body = await (await feed("/calendar.ics")).text();
    for (const line of body.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(body).toContain("\r\n ");
  });

  it("escapes iCalendar TEXT special characters", async () => {
    const repository = {
      listPublishedEvents: vi.fn(async () => [stubEvent({ title: "Jazz; Dinner, Dancing", location: "Galeria; Upstairs" })]),
    };
    const body = await (await handleCalendarFeed(new Request("https://www.westfieldbuzz.com/calendar.ics"), {
      repository,
      now: new Date("2026-09-18T12:00:00Z"),
    })).text();
    expect(body).toContain(String.raw`SUMMARY:Jazz\; Dinner\, Dancing`);
    expect(body).toContain(String.raw`LOCATION:Galeria\; Upstairs\, Westfield`);
  });

  it("rejects bad params like the JSON API", async () => {
    expect((await feed("/calendar.ics?category=Plumbing")).status).toBe(400);
  });
});
