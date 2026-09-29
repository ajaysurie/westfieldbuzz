import { afterEach, describe, expect, it, vi } from "vitest";
import { emptySearchIntent } from "../event-intent";
import { handleEventSearch } from "@/app/api/event-search/handler";
import type { EventRepository } from "../event-retrieval";
import { eventFixture } from "./test-events";

const NOW = new Date("2026-08-19T16:00:00.000Z");
const originalKey = process.env.OPENAI_API_KEY;
const originalGeminiKey = process.env.GEMINI_API_KEY;

afterEach(() => {
  if (originalKey == null) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
  if (originalGeminiKey == null) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGeminiKey;
});

function request(body: unknown): Request {
  return new Request("http://localhost/api/event-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/event-search", () => {
  it("returns deterministic fallback results when no model key is present", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const repository: EventRepository = {
      async listPublishedEvents() {
        return [
          eventFixture({ id: "music", title: "Friday Night Jazz", date: "2026-08-21T23:00:00.000Z", category: "Music", town: "Cranford", isFree: true, costAmount: 0 }),
          eventFixture({ id: "sport", title: "Friday Soccer", date: "2026-08-21T23:00:00.000Z", category: "Sports & Recreation", town: "Cranford" }),
        ];
      },
    };
    const response = await handleEventSearch(request({ query: "free music Friday night near Cranford" }), { repository, now: NOW, skipRateLimit: true });
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.fallbackUsed).toBe(true);
    expect(payload.results[0].event.id).toBe("music");
    expect(payload.results[0].reason).toMatch(/free|music|Cranford/i);
  });

  it("returns an honest no-match state with relaxation suggestions", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const repository: EventRepository = { async listPublishedEvents() { return []; } };
    const response = await handleEventSearch(request({ query: "indoors Saturday for a 5-year-old" }), { repository, now: NOW, skipRateLimit: true });
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.results).toEqual([]);
    expect(payload.suggestions).toContain("Include indoor and outdoor events");
    expect(JSON.stringify(payload)).not.toMatch(/sample|made up|suggested event/i);
    // No events in bounds means nothing unverified; the widen-the-search
    // suggestions keep their slots.
    expect(payload.unresolvedConstraints).toEqual([]);
    expect(payload.suggestions).toContain("Check nearby dates in the calendar");
  });

  it("validates query and prior intent limits", async () => {
    const repository: EventRepository = { async listPublishedEvents() { return []; } };
    const tooLong = await handleEventSearch(request({ query: "x".repeat(401) }), { repository, now: NOW, skipRateLimit: true });
    const badIntent = await handleEventSearch(request({ query: "music", intent: { version: 99 } }), { repository, now: NOW, skipRateLimit: true });
    expect(tooLong.status).toBe(400);
    expect(badIntent.status).toBe(400);
  });

  it("rejects an oversized streaming body before JSON parsing", async () => {
    const response = await handleEventSearch(
      new Request("http://localhost/api/event-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "x", padding: "y".repeat(20_000) }),
      }),
      { skipRateLimit: true }
    );
    expect(response.status).toBe(413);
  });

  it("honors the shared rate limiter", async () => {
    const response = await handleEventSearch(request({ query: "music" }), {
      ingressLimiter: async () => false,
    });
    expect(response.status).toBe(429);
  });

  it("does not charge expensive quota for malformed requests, but charges a valid one once", async () => {
    let quotaCalls = 0;
    const quotaLimiter = async () => {
      quotaCalls += 1;
      return true;
    };
    const common = {
      ingressLimiter: async () => true,
      quotaLimiter,
      repository: { async listPublishedEvents() { return []; } } satisfies EventRepository,
      now: NOW,
    };

    const invalidJson = await handleEventSearch(
      new Request("http://localhost/api/event-search", { method: "POST", body: "{" }),
      common
    );
    const invalidIntent = await handleEventSearch(request({ query: "music", intent: { version: 99 } }), common);
    const valid = await handleEventSearch(request({ query: "music" }), common);

    expect(invalidJson.status).toBe(400);
    expect(invalidIntent.status).toBe(400);
    expect(valid.status).toBe(200);
    expect(quotaCalls).toBe(1);
  });

  it("executes a validated structured intent without invoking the model or expensive quota", async () => {
    let ingressCalls = 0;
    let quotaCalls = 0;
    const parser = { parse: vi.fn() };
    const intent = { ...emptySearchIntent(), categories: ["Music" as const], towns: ["Cranford"] };
    const listPublishedEvents = vi.fn(async () => []);
    const repository: EventRepository = { listPublishedEvents };

    const response = await handleEventSearch(request({ mode: "structured", intent }), {
      repository,
      parser,
      now: NOW,
      ingressLimiter: async () => { ingressCalls += 1; return true; },
      quotaLimiter: async () => { quotaCalls += 1; return true; },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.intent).toEqual(intent);
    expect(listPublishedEvents).toHaveBeenCalledTimes(1);
    expect(ingressCalls).toBe(1);
    expect(quotaCalls).toBe(0);
    expect(parser.parse).not.toHaveBeenCalled();
  });

  it("returns a privacy-safe controlled inventory configuration error", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const repository: EventRepository = { async listPublishedEvents() { throw new Error("FIREBASE_PRIVATE_KEY=super-secret"); } };
    const response = await handleEventSearch(request({ query: "music" }), { repository, now: NOW, skipRateLimit: true });
    const body = await response.text();
    expect(response.status).toBe(503);
    expect(body).toContain("inventory_unavailable");
    expect(body).not.toContain("super-secret");
    expect(body).not.toContain("FIREBASE_PRIVATE_KEY");
  });

  it("loads events while parsing and reuses them when the intent fits the default window", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const listPublishedEvents = vi.fn(async () => [
      eventFixture({ id: "jazz", title: "Friday Night Jazz", date: "2026-08-21T23:00:00.000Z", category: "Music" }),
      eventFixture({ id: "later", title: "Autumn Fair", date: "2026-09-12T15:00:00.000Z", category: "Community" }),
    ]);
    let listedBeforeParse = false;
    const parser = {
      async parse() {
        listedBeforeParse = listPublishedEvents.mock.calls.length === 1;
        return { ...emptySearchIntent(), dateWindow: { startDate: "2026-08-21", endDate: "2026-08-21" } };
      },
    };
    const response = await handleEventSearch(request({ query: "jazz Friday" }), {
      repository: { listPublishedEvents },
      parser,
      now: NOW,
      skipRateLimit: true,
    });
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(listedBeforeParse).toBe(true);
    expect(listPublishedEvents).toHaveBeenCalledTimes(1);
    // Counts events inside the parsed window, not the whole prefetched window.
    expect(payload.meta.candidateCount).toBe(1);
    expect(payload.meta.timings).toEqual({
      parseMs: expect.any(Number),
      retrieveMs: expect.any(Number),
      matchMs: expect.any(Number),
    });
  });

  it("fetches again when the intent's dates fall outside the prefetched window", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const listPublishedEvents = vi.fn(async () => []);
    const parser = {
      async parse() {
        return { ...emptySearchIntent(), dateWindow: { startDate: "2027-03-01", endDate: "2027-03-02" } };
      },
    };
    await handleEventSearch(request({ query: "March" }), {
      repository: { listPublishedEvents },
      parser,
      now: NOW,
      skipRateLimit: true,
    });
    expect(listPublishedEvents).toHaveBeenCalledTimes(2);
    const second = (listPublishedEvents.mock.calls[1] as unknown as [{ from: Date }])[0];
    expect(second.from.toISOString().slice(0, 7)).toBe("2027-03");
  });

  it("reports the events the model was shown, not every eligible event", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const events = Array.from({ length: 75 }, (_, index) =>
      eventFixture({ id: `e${index}`, title: `Program ${index}`, date: new Date(Date.UTC(2026, 7, 20 + (index % 20), 16)).toISOString() })
    );
    const matcherFetch = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ matches: [{ eventId: "e0", reason: "fits" }] }) }] } }],
    }), { status: 200 }));
    const response = await handleEventSearch(request({ query: "programs" }), {
      repository: { async listPublishedEvents() { return events; } },
      parser: { async parse() { return emptySearchIntent(); } },
      matcherFetch,
      now: NOW,
      skipRateLimit: true,
    });
    const payload = await response.json();
    expect(matcherFetch).toHaveBeenCalledTimes(1);
    expect(payload.meta.candidateCount).toBe(60);
  });
});
