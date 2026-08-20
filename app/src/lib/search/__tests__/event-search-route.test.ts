import { afterEach, describe, expect, it } from "vitest";
import { handleEventSearch } from "@/app/api/event-search/route";
import type { EventRepository } from "../event-retrieval";
import { eventFixture } from "./test-events";

const NOW = new Date("2026-08-19T16:00:00.000Z");
const originalKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (originalKey == null) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
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
    expect(payload.results.map((result: { event: { id: string } }) => result.event.id)).toEqual(["music"]);
    expect(payload.results[0].reason).toMatch(/free|music|Cranford/i);
  });

  it("returns an honest no-match state with relaxation suggestions", async () => {
    delete process.env.OPENAI_API_KEY;
    const repository: EventRepository = { async listPublishedEvents() { return []; } };
    const response = await handleEventSearch(request({ query: "indoors Saturday for a 5-year-old" }), { repository, now: NOW, skipRateLimit: true });
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.results).toEqual([]);
    expect(payload.suggestions).toContain("Include indoor and outdoor events");
    expect(JSON.stringify(payload)).not.toMatch(/sample|made up|suggested event/i);
  });

  it("validates query and prior intent limits", async () => {
    const repository: EventRepository = { async listPublishedEvents() { return []; } };
    const tooLong = await handleEventSearch(request({ query: "x".repeat(401) }), { repository, now: NOW, skipRateLimit: true });
    const badIntent = await handleEventSearch(request({ query: "music", intent: { version: 99 } }), { repository, now: NOW, skipRateLimit: true });
    expect(tooLong.status).toBe(400);
    expect(badIntent.status).toBe(400);
  });

  it("returns a privacy-safe controlled inventory configuration error", async () => {
    delete process.env.OPENAI_API_KEY;
    const repository: EventRepository = { async listPublishedEvents() { throw new Error("FIREBASE_PRIVATE_KEY=super-secret"); } };
    const response = await handleEventSearch(request({ query: "music" }), { repository, now: NOW, skipRateLimit: true });
    const body = await response.text();
    expect(response.status).toBe(503);
    expect(body).toContain("inventory_unavailable");
    expect(body).not.toContain("super-secret");
    expect(body).not.toContain("FIREBASE_PRIVATE_KEY");
  });
});
