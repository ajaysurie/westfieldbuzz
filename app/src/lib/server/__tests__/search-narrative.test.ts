import { describe, expect, it } from "vitest";
import { composeNarrative, validateNarrative } from "../search-narrative";
import type { SearchResultItem } from "@/lib/search/search-contract";

function item(id: string, title: string): SearchResultItem {
  return {
    event: {
      id, title, description: "", date: "2026-08-22T14:30:00.000Z", endDate: null,
      location: "Memorial Library", town: "Westfield", category: "Family & Kids",
      status: "scheduled", availability: "available", publicationStatus: "published",
      freshnessStatus: "current", sourceUrl: "https://example.com", sourceId: "src",
      lastVerifiedAt: "2026-08-20T12:00:00.000Z", tags: [], minAge: null, maxAge: null,
      costAmount: null, isFree: true, environment: null, registration: null,
    } as SearchResultItem["event"],
    rank: 1, label: "", reason: "",
  };
}

const results = [item("e1", "Toddler Storytime"), item("e2", "Farmers Market")];

describe("validateNarrative (the grounding gate)", () => {
  it("accepts a narrative that cites only supplied events", () => {
    const segments = validateNarrative({ segments: [
      { text: "Saturday morning is easy: " },
      { text: "Toddler Storytime", eventId: "e1" },
      { text: " then walk to the " },
      { text: "Farmers Market", eventId: "e2" },
      { text: "." },
    ]}, results);
    expect(segments).toHaveLength(5);
  });

  it("discards the WHOLE narrative when any citation is an unknown event", () => {
    // One drifted citation means the model is not grounded; nothing survives.
    const segments = validateNarrative({ segments: [
      { text: "Try " },
      { text: "Made Up Gala", eventId: "ghost" },
    ]}, results);
    expect(segments).toBeNull();
  });

  it("rejects a narrative with no citations at all", () => {
    expect(validateNarrative({ segments: [{ text: "Have a great weekend." }] }, results)).toBeNull();
  });

  it("rejects over-long or malformed output", () => {
    expect(validateNarrative({ segments: [{ text: "x".repeat(700) }, { text: "y", eventId: "e1" }] }, results)).toBeNull();
    expect(validateNarrative({ segments: "nope" }, results)).toBeNull();
    expect(validateNarrative(null, results)).toBeNull();
  });
});

describe("composeNarrative", () => {
  it("returns null with no key or no results, never throws", async () => {
    expect(await composeNarrative({ query: "q", intent: {} as never, results: [], apiKey: "k" })).toBeNull();
  });

  it("parses a grounded model response end to end", async () => {
    const body = { candidates: [{ content: { parts: [{ text: JSON.stringify({ segments: [
      { text: "Start with " }, { text: "Toddler Storytime", eventId: "e1" }, { text: "." },
    ]}) }] } }] };
    const fetchImpl = (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
    const segments = await composeNarrative({ query: "kids saturday", intent: {} as never, results, apiKey: "k", fetchImpl });
    expect(segments?.map((s) => s.eventId ?? "")).toEqual(["", "e1", ""]);
  });

  it("degrades to null on model failure", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    expect(await composeNarrative({ query: "q", intent: {} as never, results, apiKey: "k", fetchImpl })).toBeNull();
  });
});
