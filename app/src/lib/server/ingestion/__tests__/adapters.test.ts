import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deduplicateObservations,
  fetchSourceEvents,
  humanVenue,
  parseICalPayload,
  parseJsonLdPayload,
  parseMecHtml,
  parseSquarespacePayload,
  parseTribePayload,
} from "../adapters";
import { sourceById } from "../source-registry";

// The Squarespace adapter outlived its registry entries (the venues it read
// moved to search-angle coverage), so its tests carry their own policy.
const SQUARESPACE_FIXTURE = {
  id: "squarespace-fixture",
  // The exact name matters: the assertion covers CATEGORY_MAP's
  // source-name lookup, which keeps this entry even without the source.
  name: "Rialto Center for Creativity",
  type: "squarespace-json",
  url: "https://venue.example.com/api/open/GetItemsByMonth?collectionId=abc",
  publicUrl: "https://venue.example.com/events",
  town: "Westfield",
  timezone: "America/New_York",
  autoApprove: false,
  group: "nearby-venues",
  allowedHosts: ["venue.example.com"],
  expectedContentTypes: ["application/json"],
  expectedLayoutMarker: "upcoming",
  minimumExpectedEvents: 0,
  missingGraceRuns: 2,
  timeoutMs: 12_000,
  maxResponseBytes: 2_000_000,
  anomalyFloorRatio: 0.25,
  freshnessThresholdHours: 36,
} as unknown as ReturnType<typeof source>;

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
  it("replaces calendar URLs in venue fields with the official source name", () => {
    expect(humanVenue(
      "https://www.westfieldnj.gov/calendar.aspx?EID=123",
      "Westfield Municipal Events"
    )).toBe("Westfield Municipal Events");
    expect(humanVenue("Town Hall", "Westfield Municipal Events")).toBe("Town Hall");
  });

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
    const policy = SQUARESPACE_FIXTURE;
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
    const policy = SQUARESPACE_FIXTURE;
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
    const policy = SQUARESPACE_FIXTURE;
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
    const policy = SQUARESPACE_FIXTURE;
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

describe("jsonld-index adapter", () => {
  const policy = () => source("sopac-jsonld-index");

  function detailPage(name: string, start: string): string {
    return `<html><head><script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Event",
      name,
      startDate: start,
      url: `https://www.sopacnow.org/events/${name.toLowerCase().replace(/\s+/g, "-")}/`,
      location: { "@type": "Place", name: "SOPAC", address: "One SOPAC Way, South Orange, NJ" },
    })}</script></head><body>detail</body></html>`;
  }

  function routingFetch(pages: Record<string, string | Response>) {
    const fetched: string[] = [];
    const impl = async (url: string | URL | Request) => {
      const key = String(url);
      fetched.push(key);
      const page = pages[key];
      if (page instanceof Response) return page;
      if (page === undefined) {
        return new Response("not found", { status: 404 });
      }
      return new Response(page, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    };
    return { impl: impl as typeof fetch, fetched };
  }

  it("follows index links to detail pages and parses their JSON-LD events", async () => {
    const index = `<html><body>
      <a href="/events/show-one/">One</a>
      <a href="https://www.sopacnow.org/events/show-two/">Two</a>
      <a href="/events/show-one/#tickets">dup</a>
      <a href="/about/">not an event</a>
      <a href="https://evil.example.com/events/pwned/">offsite</a>
    </body></html>`;
    const { impl, fetched } = routingFetch({
      "https://www.sopacnow.org/events/": index,
      "https://www.sopacnow.org/events/show-one/": detailPage("Show One", "2026-09-20T19:30:00-04:00"),
      "https://www.sopacnow.org/events/show-two/": detailPage("Show Two", "2026-09-27T20:00:00-04:00"),
    });
    const result = await fetchSourceEvents({ source: policy(), window, fetchImpl: impl });
    expect(result.errors).toEqual([]);
    expect(result.complete).toBe(true);
    expect(result.events).toHaveLength(2);
    expect(result.events.map((e) => e.title).sort()).toEqual(["Show One", "Show Two"]);
    expect(result.events[0]).toMatchObject({
      town: "South Orange",
      sourceId: "sopac-jsonld-index",
      category: "Entertainment",
    });
    // The duplicate href and the off-site/non-matching links were never fetched.
    expect(fetched).toEqual([
      "https://www.sopacnow.org/events/",
      "https://www.sopacnow.org/events/show-one/",
      "https://www.sopacnow.org/events/show-two/",
    ]);
  });

  it("marks an index with no matching links incomplete so events are not aged", async () => {
    const { impl } = routingFetch({
      "https://www.sopacnow.org/events/": "<html><body>no links</body></html>",
    });
    const result = await fetchSourceEvents({ source: policy(), window, fetchImpl: impl });
    expect(result.complete).toBe(false);
    expect(result.errors).toContain("Expected source layout marker was missing");
    expect(result.errors.some((e) => e.includes("no detail pages"))).toBe(true);
  });

  it("fails closed when the configured layout marker is absent", async () => {
    const marked = { ...policy(), expectedLayoutMarker: "mc_event_listing" };
    const { impl } = routingFetch({
      "https://www.sopacnow.org/events/": `<html><body><a href="/events/show-one/">One</a></body></html>`,
      "https://www.sopacnow.org/events/show-one/": detailPage("Show One", "2026-09-20T19:30:00-04:00"),
    });
    const result = await fetchSourceEvents({ source: marked, window, fetchImpl: impl });
    expect(result.complete).toBe(false);
    expect(result.errors).toContain("Expected source layout marker was missing");
  });

  it("keeps good detail pages when a sibling detail fetch fails", async () => {
    const index = `<html><body>
      <a href="/events/show-one/">One</a>
      <a href="/events/broken/">Broken</a>
    </body></html>`;
    const { impl } = routingFetch({
      "https://www.sopacnow.org/events/": index,
      "https://www.sopacnow.org/events/show-one/": detailPage("Show One", "2026-09-20T19:30:00-04:00"),
      "https://www.sopacnow.org/events/broken/": new Response("oops", { status: 500 }),
    });
    const result = await fetchSourceEvents({ source: policy(), window, fetchImpl: impl });
    expect(result.complete).toBe(false);
    expect(result.events).toHaveLength(1);
    expect(result.errors.some((e) => e.includes("/events/broken/"))).toBe(true);
  }, 15_000);

  it("caps the detail crawl at maxDetailPages with a warning", async () => {
    const capped = { ...policy(), maxDetailPages: 1 };
    const index = `<html><body>
      <a href="/events/show-one/">One</a>
      <a href="/events/show-two/">Two</a>
    </body></html>`;
    const { impl, fetched } = routingFetch({
      "https://www.sopacnow.org/events/": index,
      "https://www.sopacnow.org/events/show-one/": detailPage("Show One", "2026-09-20T19:30:00-04:00"),
      "https://www.sopacnow.org/events/show-two/": detailPage("Show Two", "2026-09-27T20:00:00-04:00"),
    });
    const result = await fetchSourceEvents({ source: capped, window, fetchImpl: impl });
    expect(result.events).toHaveLength(1);
    expect(fetched).toHaveLength(2);
    expect(result.warnings.some((w) => w.includes("capped at 1 of 2"))).toBe(true);
  });

  it("stops fetching detail pages when the global deadline hits", async () => {
    const index = `<html><body>
      <a href="/events/show-one/">One</a>
      <a href="/events/show-two/">Two</a>
    </body></html>`;
    const fetched: string[] = [];
    const impl = (async (url: string | URL | Request) => {
      const key = String(url);
      fetched.push(key);
      if (key.endsWith("/events/")) {
        return new Response(index, { status: 200, headers: { "content-type": "text/html" } });
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      return new Response(detailPage("Show", "2026-09-20T19:30:00-04:00"), {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }) as typeof fetch;
    const result = await fetchSourceEvents({
      source: policy(),
      window,
      fetchImpl: impl,
      deadlineAt: new Date(Date.now() + 50),
    });
    // The in-flight detail fetch resolves after the deadline, so its body read
    // aborts and no events are kept; the second detail never starts.
    expect(result.events).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes("truncated"))).toBe(true);
    expect(fetched).toHaveLength(2);
  }, 15_000);

  it("keeps every night of a multi-date run that reuses one event URL", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Event",
          name: "SHU",
          startDate: "2026-10-15T20:00:00-04:00",
          url: "https://www.sopacnow.org/events/shu/",
        },
        {
          "@type": "Event",
          name: "SHU",
          startDate: "2026-10-16T20:00:00-04:00",
          url: "https://www.sopacnow.org/events/shu/",
        },
      ],
    })}</script>`;
    const parsed = parseJsonLdPayload(policy(), html, window);
    expect(parsed.events).toHaveLength(2);
    expect(parsed.events[0].sourceEventId).toBe("https://www.sopacnow.org/events/shu/");
    expect(parsed.events[1].sourceEventId).toContain("#2026-10-17T00:00:00.000Z");
  });
});

describe("eventbrite-organizer adapter", () => {
  const policy = () => source("crossroads-eventbrite");

  function organizerPage(events: unknown[]): string {
    return `<html><body><script>window.__state = ${JSON.stringify({ upcomingEvents: events })};</script></body></html>`;
  }

  const SHOW = {
    id: "1992011276351",
    eventbrite_event_id: "1992011276351",
    name: "Jeff Rosenstock",
    url: "https://www.eventbrite.com/e/jeff-rosenstock-tickets-1992011276351",
    start_date: "2026-09-19",
    start_time: "19:00:00",
    end_date: "2026-09-19",
    end_time: "23:00:00",
    timezone: "America/New_York",
    is_cancelled: false,
    summary: "Punk rock show",
    primary_venue: {
      name: "Crossroads",
      address: { address_1: "78 North Ave", city: "Garwood" },
    },
    image: { url: "https://img.evbuc.com/img/1.jpg" },
  };

  it("extracts upcoming events from the embedded organizer page state", async () => {
    const result = await fetchSourceEvents({
      source: policy(),
      window,
      fetchImpl: async () =>
        new Response(organizerPage([SHOW, { ...SHOW, eventbrite_event_id: "x2", id: "x2", name: "Cancelled Show", is_cancelled: true, start_date: "2026-10-01", end_date: "2026-10-01" }]), {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    });
    expect(result.errors).toEqual([]);
    expect(result.complete).toBe(true);
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({
      title: "Jeff Rosenstock",
      sourceEventId: "1992011276351",
      sourceUrl: "https://www.eventbrite.com/e/jeff-rosenstock-tickets-1992011276351",
      location: "Crossroads, 78 North Ave, Garwood",
      town: "Garwood",
      category: "Music",
      status: "scheduled",
      imageUrl: "https://img.evbuc.com/img/1.jpg",
    });
    expect(result.events[0].date.toISOString()).toBe("2026-09-19T23:00:00.000Z");
    expect(result.events[1].status).toBe("cancelled");
  });

  it("drops out-of-window events and fails closed on layout break", async () => {
    const stale = { ...SHOW, start_date: "2030-01-01", end_date: "2030-01-01" };
    const result = await fetchSourceEvents({
      source: policy(),
      window,
      fetchImpl: async () =>
        new Response(organizerPage([stale]), {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    });
    expect(result.events).toHaveLength(0);
    expect(result.complete).toBe(true); // layout valid, legitimately empty window

    const broken = await fetchSourceEvents({
      source: policy(),
      window,
      fetchImpl: async () =>
        new Response("<html><body>redesign</body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    });
    expect(broken.complete).toBe(false);
    expect(broken.errors).toContain("Expected source layout marker was missing");
  });
});
