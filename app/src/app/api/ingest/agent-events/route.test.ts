import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  reconcileSource: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminDb: () => ({}),
}));

vi.mock("@/lib/server/ingestion/firestore-repository", () => ({
  reconcileSource: mocks.reconcileSource,
}));

import { POST } from "./route";

const TEST_KEY = "test-agent-ingest-key";

function request(body: unknown, key: string | null = TEST_KEY) {
  return new Request("https://westfieldbuzz.com/api/ingest/agent-events", {
    method: "POST",
    headers: {
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function futureISO(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function validEvent(overrides: Record<string, unknown> = {}) {
  return {
    instagram_handle: "stagehousetavern",
    post_url: "https://www.instagram.com/p/ABC123xyz/",
    title: "Live Jazz Friday",
    description: "Quartet on the patio.",
    date: futureISO(7),
    location: "Stage House Tavern",
    town: "Scotch Plains",
    ...overrides,
  };
}

describe("agent events ingest route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AGENT_INGEST_KEY = TEST_KEY;
    mocks.reconcileSource.mockResolvedValue({
      created: 1, updated: 0, verified: 0, candidates: 0, safetyHeld: false,
    });
  });

  it("returns 401 without an authorization header", async () => {
    const response = await POST(request({ events: [] }, null));
    expect(response.status).toBe(401);
    expect(mocks.reconcileSource).not.toHaveBeenCalled();
  });

  it("returns 401 for the wrong key", async () => {
    const response = await POST(request({ events: [] }, "wrong-key"));
    expect(response.status).toBe(401);
  });

  it("returns 503 when the ingest key is not configured", async () => {
    delete process.env.AGENT_INGEST_KEY;
    const response = await POST(request({ events: [] }));
    expect(response.status).toBe(503);
    expect(mocks.reconcileSource).not.toHaveBeenCalled();
  });

  it("returns 400 when the body has no events array", async () => {
    const response = await POST(request({ nope: true }));
    expect(response.status).toBe(400);
  });

  it("returns 400 when more than 100 events are pushed", async () => {
    const response = await POST(
      request({ events: Array.from({ length: 101 }, () => validEvent()) })
    );
    expect(response.status).toBe(400);
  });

  it("reconciles a valid event through the pipeline", async () => {
    const event = validEvent();
    const response = await POST(request({ events: [event] }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      source: "muse-agent-instagram",
      received: 1,
      accepted: 1,
      created: 1,
    });
    expect(payload.dropped).toEqual([]);
    expect(mocks.reconcileSource).toHaveBeenCalledTimes(1);
    const args = mocks.reconcileSource.mock.calls[0][0];
    expect(args.write).toBe(true);
    expect(args.complete).toBe(true);
    expect(args.source.id).toBe("muse-agent-instagram");
    expect(args.source.autoApprove).toBe(true);
    expect(args.observations).toHaveLength(1);
    const observation = args.observations[0];
    expect(observation.sourceId).toBe("muse-agent-instagram");
    expect(observation.sourceUrl).toBe(event.post_url);
    expect(observation.sourceEventId).toBe(
      `ig:stagehousetavern:ABC123xyz#${event.date.slice(0, 10)}`
    );
    expect(observation.category).toBe("Community");
    expect(observation.status).toBe("scheduled");
  });

  it("drops malformed and out-of-area events with reasons and keeps the valid ones", async () => {
    const events = [
      validEvent(),
      validEvent({ title: "Old News", date: new Date(Date.now() - 30 * 86_400_000).toISOString() }),
      validEvent({ title: "Bad Cat", category: "Nightlife" }),
      validEvent({ title: "Bad URL", post_url: "https://example.com/post/1" }),
      validEvent({ title: "Far Away", location: "Barclays Center", town: "Brooklyn" }),
      validEvent({ title: "No Date" }),
    ];
    delete (events[5] as Record<string, unknown>).date;

    const response = await POST(request({ events }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.received).toBe(6);
    expect(payload.accepted).toBe(1);
    expect(payload.dropped).toHaveLength(5);
    const reasons = payload.dropped.map((d: { reason: string }) => d.reason);
    expect(reasons.some((r: string) => r.includes("more than 14 days in the past"))).toBe(true);
    expect(reasons.some((r: string) => r.includes("not a known category"))).toBe(true);
    expect(reasons.some((r: string) => r.includes("not an Instagram post/reel URL"))).toBe(true);
    expect(reasons.some((r: string) => r.includes("out of area"))).toBe(true);
    expect(reasons.some((r: string) => r.includes("not a parseable date-time"))).toBe(true);
    // Dropped indices are reported so the caller can fix and resend.
    expect(payload.dropped.map((d: { index: number }) => d.index)).toEqual([1, 2, 3, 4, 5]);
    expect(mocks.reconcileSource).toHaveBeenCalledTimes(1);
    expect(mocks.reconcileSource.mock.calls[0][0].observations).toHaveLength(1);
  });

  it("supports reel URLs and explicit categories", async () => {
    const event = validEvent({
      post_url: "https://www.instagram.com/reel/DEF456/",
      category: "Music",
    });
    const response = await POST(request({ events: [event] }));
    expect(response.status).toBe(200);
    const observation = mocks.reconcileSource.mock.calls[0][0].observations[0];
    expect(observation.sourceEventId).toBe(
      `ig:stagehousetavern:DEF456#${event.date.slice(0, 10)}`
    );
    expect(observation.category).toBe("Music");
  });
});
