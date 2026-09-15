import { describe, expect, it, vi } from "vitest";
import { matchEventsWithModel } from "../search-matcher";
import type { SearchableEvent } from "@/lib/search/event-retrieval";

function candidate(id: string, title: string): SearchableEvent {
  return {
    id,
    title,
    description: `About ${title}`,
    date: "2026-09-19T23:00:00.000Z",
    endDate: null,
    location: "Venue",
    town: "Westfield",
    category: "Entertainment",
    status: "scheduled",
    availability: "available",
    publicationStatus: "published",
    freshnessStatus: "current",
    sourceUrl: "https://example.com",
    sourceId: "src",
    lastVerifiedAt: "2026-09-14T00:00:00.000Z",
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
  };
}

function geminiResponse(payload: unknown): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
    }),
    { status: 200 }
  );
}

const candidates = [candidate("a", "Jazz Night"), candidate("b", "Book Sale")];

describe("matchEventsWithModel", () => {
  it("returns grounded matches in model order with reasons", async () => {
    const fetchImpl = vi.fn(async () =>
      geminiResponse({
        matches: [
          { eventId: "b", reason: "weekend book sale fits browsing" },
          { eventId: "a", reason: "evening jazz for a night out" },
        ],
        narrative: [{ text: "The " }, { text: "book sale", eventId: "b" }, { text: " is the easy pick." }],
      })
    );
    const result = await matchEventsWithModel({ query: "q", candidates, fetchImpl, apiKey: "k" });
    expect(result?.matches.map((m) => m.event.id)).toEqual(["b", "a"]);
    expect(result?.matches[0].reason).toContain("book sale");
    expect(result?.narrative?.[1]).toMatchObject({ eventId: "b" });
  });

  it("rejects a payload citing an unknown event id", async () => {
    const fetchImpl = vi.fn(async () =>
      geminiResponse({ matches: [{ eventId: "zzz", reason: "invented" }] })
    );
    expect(await matchEventsWithModel({ query: "q", candidates, fetchImpl, apiKey: "k" })).toBeNull();
  });

  it("rejects duplicate event ids", async () => {
    const fetchImpl = vi.fn(async () =>
      geminiResponse({
        matches: [
          { eventId: "a", reason: "one" },
          { eventId: "a", reason: "two" },
        ],
      })
    );
    expect(await matchEventsWithModel({ query: "q", candidates, fetchImpl, apiKey: "k" })).toBeNull();
  });

  it("accepts an empty matches list as a real answer", async () => {
    const fetchImpl = vi.fn(async () => geminiResponse({ matches: [] }));
    const result = await matchEventsWithModel({ query: "q", candidates, fetchImpl, apiKey: "k" });
    expect(result?.matches).toEqual([]);
  });

  it("returns null without an api key or candidates, and on transport failure", async () => {
    const fetchImpl = vi.fn(async () => new Response("err", { status: 500 }));
    expect(await matchEventsWithModel({ query: "q", candidates: [], fetchImpl, apiKey: "k" })).toBeNull();
    expect(await matchEventsWithModel({ query: "q", candidates, fetchImpl, apiKey: "" })).toBeNull();
    expect(await matchEventsWithModel({ query: "q", candidates, fetchImpl, apiKey: "k" })).toBeNull();
  });

  it("drops a narrative that cites an unmatched event but keeps matches", async () => {
    const fetchImpl = vi.fn(async () =>
      geminiResponse({
        matches: [{ eventId: "a", reason: "fits" }],
        narrative: [{ text: "ghost event", eventId: "nope" }],
      })
    );
    const result = await matchEventsWithModel({ query: "q", candidates, fetchImpl, apiKey: "k" });
    expect(result?.matches).toHaveLength(1);
    expect(result?.narrative).toBeNull();
  });
});
