import { describe, expect, it, vi } from "vitest";
import { handleFeedback, type FeedbackDeps } from "@/app/api/feedback/handler";

function deps(overrides: Partial<FeedbackDeps> = {}): FeedbackDeps {
  return {
    allow: vi.fn(async () => true),
    eventExists: vi.fn(async () => true),
    save: vi.fn(async () => "fb-1"),
    ...overrides,
  };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://www.westfieldbuzz.com/api/feedback", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/feedback", () => {
  it("stores an agent report with its user agent", async () => {
    const d = deps();
    const response = await handleFeedback(
      post({ eventId: "evt-1", reason: "cancelled", message: "Source says cancelled" }, { "user-agent": "ExampleBot/1.0" }),
      d,
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true, id: "fb-1" });
    expect(d.save).toHaveBeenCalledWith({
      eventId: "evt-1",
      reason: "cancelled",
      message: "Source says cancelled",
      contact: "",
      via: "agent",
      userAgent: "ExampleBot/1.0",
    });
  });

  it("marks reports from the site form as web", async () => {
    const d = deps();
    await handleFeedback(post({ reason: "missing-event", message: "Tree lighting", via: "web" }), d);
    expect(d.save).toHaveBeenCalledWith(expect.objectContaining({ via: "web", eventId: null }));
  });

  it("returns 404 for an unknown event", async () => {
    const d = deps({ eventExists: vi.fn(async () => false) });
    const response = await handleFeedback(post({ eventId: "nope", reason: "duplicate" }), d);
    expect(response.status).toBe(404);
    expect(d.save).not.toHaveBeenCalled();
  });

  it("returns 400 with a reason for invalid input", async () => {
    const response = await handleFeedback(post({ reason: "bogus" }), deps());
    expect(response.status).toBe(400);
    expect((await response.json()).message).toContain("reason must be one of");
    expect((await handleFeedback(post("not json"), deps())).status).toBe(400);
  });

  it("rate limits before reading the body", async () => {
    const d = deps({ allow: vi.fn(async () => false) });
    const response = await handleFeedback(post({ eventId: "evt-1", reason: "duplicate" }), d);
    expect(response.status).toBe(429);
    expect(d.save).not.toHaveBeenCalled();
  });

  it("silently drops honeypot submissions", async () => {
    const d = deps();
    const response = await handleFeedback(post({ reason: "other", message: "buy now", website: "spam.example" }), d);
    expect(response.status).toBe(202);
    expect(d.save).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies", async () => {
    const response = await handleFeedback(post({ reason: "other", message: "x".repeat(9000) }), deps());
    expect(response.status).toBe(413);
  });

  it("returns 503 when storage fails", async () => {
    const d = deps({ save: vi.fn(async () => { throw new Error("down"); }) });
    expect((await handleFeedback(post({ eventId: "evt-1", reason: "duplicate" }), d)).status).toBe(503);
  });
});
