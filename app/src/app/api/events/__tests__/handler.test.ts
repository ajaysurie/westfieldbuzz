import { describe, expect, it, vi } from "vitest";
import { handlePublicEvents } from "@/app/api/events/handler";
import type {
  EventRepository,
  SearchableEvent,
} from "@/lib/search/event-retrieval";

function stubEvent(overrides: Partial<SearchableEvent> = {}): SearchableEvent {
  return {
    id: "evt-1",
    title: "Test event",
    description: "Description",
    date: "2026-09-20T19:00:00-04:00",
    endDate: null,
    location: "Galeria",
    town: "Westfield",
    category: "Music",
    status: "scheduled",
    availability: "available",
    publicationStatus: "published",
    freshnessStatus: "current",
    sourceUrl: "https://example.com",
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

function stubRepository(events: SearchableEvent[]): EventRepository {
  return {
    listPublishedEvents: vi.fn(async () => events),
  };
}

function get(path: string, now = new Date("2026-09-18T12:00:00Z")) {
  const repository = stubRepository([
    stubEvent({ id: "a", date: "2026-09-20T19:00:00-04:00", town: "Westfield", category: "Music" }),
    stubEvent({ id: "b", date: "2026-09-21T10:00:00-04:00", town: "Cranford", category: "Markets" }),
    stubEvent({ id: "c", date: "2026-09-19T09:00:00-04:00", town: "Westfield", category: "Music" }),
  ]);
  return handlePublicEvents(new Request(`https://westfieldbuzz.com${path}`), {
    repository,
    now,
  }).then(async (response) => ({
    response,
    body: (await response.json()) as { events: Array<{ id: string; url: string }>; count: number },
    repository,
  }));
}

describe("GET /api/events", () => {
  it("returns published events sorted by start date with stable URLs", async () => {
    const { response, body } = await get("/api/events");

    expect(response.status).toBe(200);
    expect(body.events.map((event) => event.id)).toEqual(["c", "a", "b"]);
    expect(body.count).toBe(3);
    expect(body.events[0]!.url).toBe("https://westfieldbuzz.com/events/c");
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=3600");
  });

  it("filters by town case-insensitively", async () => {
    const { body } = await get("/api/events?town=cranford");

    expect(body.events.map((event) => event.id)).toEqual(["b"]);
  });

  it("filters by category case-insensitively", async () => {
    const { body } = await get("/api/events?category=music");

    expect(body.events.map((event) => event.id)).toEqual(["c", "a"]);
  });

  it("filters by an Eastern date window", async () => {
    const { body } = await get("/api/events?from=2026-09-20&to=2026-09-20");

    expect(body.events.map((event) => event.id)).toEqual(["a"]);
  });

  it("respects the limit parameter", async () => {
    const { body } = await get("/api/events?limit=2");

    expect(body.events).toHaveLength(2);
    expect(body.count).toBe(2);
  });

  it("rejects an unknown category", async () => {
    const { response } = await get("/api/events?category=Plumbing");

    expect(response.status).toBe(400);
  });

  it("rejects malformed dates and inverted windows", async () => {
    expect((await get("/api/events?from=next-friday")).response.status).toBe(400);
    expect((await get("/api/events?from=2026-09-21&to=2026-09-20")).response.status).toBe(400);
  });

  it("rejects an out-of-range limit", async () => {
    expect((await get("/api/events?limit=0")).response.status).toBe(400);
    expect((await get("/api/events?limit=500")).response.status).toBe(400);
  });

  it("returns 503 when the event store is unreachable", async () => {
    const repository: EventRepository = {
      listPublishedEvents: vi.fn(async () => {
        throw new Error("firestore down");
      }),
    };
    const response = await handlePublicEvents(
      new Request("https://westfieldbuzz.com/api/events"),
      { repository },
    );

    expect(response.status).toBe(503);
  });

  it("queries a padded Firestore window so ET day edges are exact", async () => {
    const { repository } = await get("/api/events?from=2026-09-20&to=2026-09-20");
    const window = (repository.listPublishedEvents as ReturnType<typeof vi.fn>).mock.calls[0]![0];

    expect(window.from.toISOString()).toBe("2026-09-19T00:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-09-21T23:59:59.999Z");
  });
});
