import { describe, expect, it } from "vitest";
import { parseFeedback } from "@/lib/feedback";

describe("parseFeedback", () => {
  it("accepts a listing report", () => {
    expect(parseFeedback({ eventId: "abc_123", reason: "wrong-details", message: " Starts at 7 " }))
      .toEqual({ ok: true, value: { eventId: "abc_123", reason: "wrong-details", message: "Starts at 7", contact: "" } });
  });

  it("accepts a missing-event suggestion without an eventId", () => {
    const result = parseFeedback({ reason: "missing-event", message: "Tree lighting, Dec 5", contact: "me@example.com" });
    expect(result.ok && result.value.eventId).toBe(null);
  });

  it("requires an eventId for listing reports", () => {
    expect(parseFeedback({ reason: "duplicate" })).toMatchObject({ ok: false });
  });

  it("requires a message when the reason needs one", () => {
    expect(parseFeedback({ reason: "other", message: "" })).toMatchObject({ ok: false });
    expect(parseFeedback({ reason: "missing-event" })).toMatchObject({ ok: false });
  });

  it("rejects unknown reasons, bad ids, and oversized text", () => {
    expect(parseFeedback({ reason: "spam", eventId: "a" })).toMatchObject({ ok: false });
    expect(parseFeedback({ reason: "duplicate", eventId: "../etc" })).toMatchObject({ ok: false });
    expect(parseFeedback({ reason: "other", message: "x".repeat(1001) })).toMatchObject({ ok: false });
    expect(parseFeedback({ reason: "other", message: 42 })).toMatchObject({ ok: false });
    expect(parseFeedback(null)).toMatchObject({ ok: false });
  });
});
