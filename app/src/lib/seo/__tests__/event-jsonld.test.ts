import { describe, expect, it } from "vitest";
import { buildEventJsonLd, eventPageUrl } from "@/lib/seo/event-jsonld";
import type { SearchableEvent } from "@/lib/search/event-retrieval";

function baseEvent(overrides: Partial<SearchableEvent> = {}): SearchableEvent {
  return {
    id: "evt-123",
    title: "Latin Jazz at Galeria",
    description: "An evening of Latin jazz.",
    date: "2026-09-20T19:00:00-04:00",
    endDate: "2026-09-20T21:00:00-04:00",
    location: "Galeria",
    town: "Westfield",
    category: "Music",
    status: "scheduled",
    availability: "available",
    publicationStatus: "published",
    freshnessStatus: "current",
    sourceUrl: "https://example.com/event",
    sourceId: "src-1",
    lastVerifiedAt: "2026-09-18T10:00:00Z",
    tags: [],
    minAge: null,
    maxAge: null,
    costAmount: null,
    isFree: null,
    environment: null,
    registration: null,
    accessibility: [],
    driveMinutes: null,
    factEvidence: {},
    ...overrides,
  };
}

describe("buildEventJsonLd", () => {
  it("emits a valid schema.org Event with a stable canonical URL", () => {
    const jsonLd = buildEventJsonLd(baseEvent());

    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("Event");
    expect(jsonLd.name).toBe("Latin Jazz at Galeria");
    expect(jsonLd.startDate).toBe("2026-09-20T19:00:00-04:00");
    expect(jsonLd.endDate).toBe("2026-09-20T21:00:00-04:00");
    expect(jsonLd.eventStatus).toBe("https://schema.org/EventScheduled");
    expect(jsonLd.eventAttendanceMode).toBe(
      "https://schema.org/OfflineEventAttendanceMode",
    );
    expect(jsonLd.url).toBe("https://westfieldbuzz.com/events/evt-123");
    expect(jsonLd.location).toMatchObject({
      "@type": "Place",
      name: "Galeria",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Westfield",
        addressRegion: "NJ",
      },
    });
    expect(jsonLd.description).toBe("An evening of Latin jazz.");
  });

  it("maps each event status to its schema.org equivalent", () => {
    const statuses: Array<[SearchableEvent["status"], string]> = [
      ["scheduled", "https://schema.org/EventScheduled"],
      ["cancelled", "https://schema.org/EventCancelled"],
      ["postponed", "https://schema.org/EventPostponed"],
      ["rescheduled", "https://schema.org/EventRescheduled"],
      ["weather-dependent", "https://schema.org/EventScheduled"],
    ];
    for (const [status, expected] of statuses) {
      expect(buildEventJsonLd(baseEvent({ status })).eventStatus).toBe(expected);
    }
  });

  it("omits optional fields when the source did not supply them", () => {
    const jsonLd = buildEventJsonLd(
      baseEvent({ endDate: null, imageUrl: undefined, description: "  " }),
    );

    expect(jsonLd.endDate).toBeUndefined();
    expect(jsonLd.image).toBeUndefined();
    expect(jsonLd.description).toBeUndefined();
  });

  it("falls back to the town when the venue name is blank", () => {
    const jsonLd = buildEventJsonLd(baseEvent({ location: "  " }));

    expect(jsonLd.location.name).toBe("Westfield");
  });

  it("truncates long descriptions", () => {
    const jsonLd = buildEventJsonLd(baseEvent({ description: "x".repeat(600) }));

    expect(jsonLd.description).toHaveLength(500);
  });

  it("builds stable, encoded event URLs", () => {
    expect(eventPageUrl("evt-123")).toBe("https://westfieldbuzz.com/events/evt-123");
    expect(eventPageUrl("a b/c")).toBe("https://westfieldbuzz.com/events/a%20b%2Fc");
  });
});
