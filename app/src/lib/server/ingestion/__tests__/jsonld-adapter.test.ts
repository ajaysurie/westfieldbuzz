import { describe, expect, it } from "vitest";
import { parseJsonLdPayload } from "../adapters";
import type { EventSourcePolicy } from "../types";

const source = {
  id: "test-jsonld",
  name: "Test Venue",
  type: "jsonld",
  url: "https://example.com/events",
  publicUrl: "https://example.com/events",
  town: "Westfield",
  timezone: "America/New_York",
  autoApprove: false,
  group: "nearby-venues",
  allowedHosts: ["example.com"],
  expectedContentTypes: ["text/html"],
  minimumExpectedEvents: 1,
  missingGraceRuns: 2,
  timeoutMs: 12_000,
  maxResponseBytes: 2_000_000,
  anomalyFloorRatio: 0.25,
  freshnessThresholdHours: 36,
} as unknown as EventSourcePolicy;

const window = {
  from: new Date("2026-08-01T00:00:00Z"),
  to: new Date("2026-12-31T00:00:00Z"),
  fromLocalDate: "2026-08-01",
  toLocalDate: "2026-12-31",
};

function page(payload: unknown): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(payload)}</script></head><body></body></html>`;
}

describe("parseJsonLdPayload", () => {
  it("extracts a plain schema.org Event", () => {
    const result = parseJsonLdPayload(source, page({
      "@context": "https://schema.org", "@type": "Event",
      name: "Autumn Concert",
      description: "<p>Outdoor <b>concert</b></p>",
      startDate: "2026-09-12T19:00:00-04:00",
      endDate: "2026-09-12T21:00:00-04:00",
      url: "https://example.com/events/autumn",
      location: { "@type": "Place", name: "Town Green", address: { streetAddress: "1 Main St", addressLocality: "Westfield" } },
    }), window);

    expect(result.layoutValid).toBe(true);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].title).toBe("Autumn Concert");
    expect(result.events[0].location).toBe("Town Green, 1 Main St, Westfield");
    expect(result.events[0].description).not.toContain("<b>");
    expect(result.events[0].sourceEventId).toBe("https://example.com/events/autumn");
  });

  it("accepts event subtypes and @graph nesting", () => {
    const result = parseJsonLdPayload(source, page({
      "@graph": [
        { "@type": "WebSite", name: "ignored" },
        { "@type": "MusicEvent", name: "Jazz Night", startDate: "2026-09-20T20:00:00-04:00" },
        { "@type": ["TheaterEvent"], name: "Our Town", startDate: "2026-10-02T19:30:00-04:00" },
      ],
    }), window);

    expect(result.events.map((event) => event.title)).toEqual(["Jazz Night", "Our Town"]);
  });

  it("unwraps ItemList results", () => {
    const result = parseJsonLdPayload(source, page({
      "@type": "ItemList",
      itemListElement: [
        { "@type": "ListItem", item: { "@type": "Event", name: "Listed", startDate: "2026-09-05T10:00:00-04:00" } },
      ],
    }), window);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].title).toBe("Listed");
  });

  it("maps cancellation and sold-out signals", () => {
    const result = parseJsonLdPayload(source, page([
      { "@type": "Event", name: "Cancelled Thing", startDate: "2026-09-06T10:00:00-04:00",
        eventStatus: "https://schema.org/EventCancelled" },
      { "@type": "Event", name: "Sold Out Thing", startDate: "2026-09-07T10:00:00-04:00",
        offers: { "@type": "Offer", availability: "https://schema.org/SoldOut" } },
    ]), window);

    expect(result.events[0].status).toBe("cancelled");
    expect(result.events[1].availability).toBe("sold-out");
  });

  it("drops events outside the window without erroring", () => {
    const result = parseJsonLdPayload(source, page({
      "@type": "Event", name: "Ancient", startDate: "2001-01-01T10:00:00-05:00",
    }), window);

    expect(result.events).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("records an error for an unparseable date but keeps the rest of the page", () => {
    const result = parseJsonLdPayload(source, page([
      { "@type": "Event", name: "Broken", startDate: "not-a-date" },
      { "@type": "Event", name: "Fine", startDate: "2026-09-08T10:00:00-04:00" },
    ]), window);

    expect(result.events.map((event) => event.title)).toEqual(["Fine"]);
    expect(result.errors.join(" ")).toContain("Broken");
  });

  it("survives one malformed block without losing a valid sibling", () => {
    const html = `<script type="application/ld+json">{ not json </script>`
      + `<script type="application/ld+json">${JSON.stringify({ "@type": "Event", name: "Survivor", startDate: "2026-09-09T10:00:00-04:00" })}</script>`;
    const result = parseJsonLdPayload(source, html, window);

    expect(result.events.map((event) => event.title)).toEqual(["Survivor"]);
    expect(result.errors.join(" ")).toContain("Malformed");
  });

  it("treats a page with no JSON-LD as a layout change, not an empty calendar", () => {
    const result = parseJsonLdPayload(source, "<html><body>nothing</body></html>", window);

    expect(result.layoutValid).toBe(false);
    expect(result.events).toHaveLength(0);
  });
});
