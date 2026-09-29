import { describe, expect, it, vi } from "vitest";
import { matchEventsWithModel, selectPromptCandidates } from "../search-matcher";
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

describe("selectPromptCandidates", () => {
  const many = Array.from({ length: 70 }, (_, index) => candidate(`e${index}`, `Library program ${index}`));
  many[65] = candidate("halloween", "Halloween Parade");
  many[66] = { ...candidate("family", "Pumpkin Patch"), category: "Family & Kids" };

  it("keeps late matches that date order alone would cut", () => {
    const chosen = selectPromptCandidates(many, { keywords: ["Halloween"], categories: ["Family & Kids"] }, 60);
    expect(chosen).toHaveLength(60);
    expect(chosen.map((event) => event.id)).toContain("halloween");
    expect(chosen.map((event) => event.id)).toContain("family");
  });

  it("returns the chosen events in their original date order", () => {
    const chosen = selectPromptCandidates(many, { keywords: ["halloween"], categories: [] }, 60);
    const positions = chosen.map((event) => many.indexOf(event));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("passes small candidate lists through unchanged", () => {
    expect(selectPromptCandidates(candidates, { keywords: ["zzz"], categories: [] }, 60)).toBe(candidates);
  });

  it("ranks a later keyword match above earlier category-only matches", () => {
    const concerts = Array.from({ length: 70 }, (_, index) => ({ ...candidate(`c${index}`, `Concert ${index}`), category: "Music" as const }));
    const halloween = { ...candidate("halloween-show", "Halloween Show"), category: "Entertainment" as const };
    const chosen = selectPromptCandidates([...concerts, halloween], { keywords: ["halloween"], categories: ["Music"] }, 60);
    expect(chosen.map((event) => event.id)).toContain("halloween-show");
  });

  it("matches keywords only in text the model is shown", () => {
    const hidden = Array.from({ length: 60 }, (_, index) => ({
      ...candidate(`hidden${index}`, `Program ${index}`),
      description: `${"x".repeat(300)} halloween`,
      tags: ["halloween"],
    }));
    const visible = candidate("visible", "Halloween Parade");
    const chosen = selectPromptCandidates([...hidden, visible], { keywords: ["halloween"], categories: [] }, 60);
    expect(chosen.map((event) => event.id)).toContain("visible");
  });
});

describe("matchEventsWithModel", () => {
  it("unlinks a citation that spans a whole sentence instead of the event name", async () => {
    const fetchImpl = vi.fn(async () =>
      geminiResponse({
        matches: [{ eventId: "a", reason: "jazz" }],
        narrative: [
          { text: "For live music this Friday night, check out Jazz Night at the Rialto downtown.", eventId: "a" },
        ],
      })
    );
    const result = await matchEventsWithModel({ query: "q", candidates, fetchImpl, apiKey: "k" });
    expect(result?.narrative).toEqual([
      { text: "For live music this Friday night, check out Jazz Night at the Rialto downtown." },
    ]);
  });

  it("asks for low thinking so search stays fast", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => geminiResponse({ matches: [] }));
    await matchEventsWithModel({ query: "q", candidates, fetchImpl, apiKey: "k", model: "gemini-3.7-flash" });
    const body = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "low" });
  });

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
