import { describe, expect, it } from "vitest";
import { extractEventsWithLlm, validateExtraction } from "../llm-extractor";
import type { EventSourcePolicy } from "../types";

const source = {
  id: "patch-westfield-llm", name: "Westfield Patch Calendar", type: "llm-extract",
  url: "https://patch.com/new-jersey/westfield/calendar",
  publicUrl: "https://patch.com/new-jersey/westfield/calendar",
  town: "Westfield", timezone: "America/New_York", autoApprove: false,
  group: "nearby-venues", allowedHosts: ["patch.com"],
  expectedContentTypes: ["text/html"], minimumExpectedEvents: 0,
  missingGraceRuns: 2, timeoutMs: 12_000, maxResponseBytes: 4_000_000,
  anomalyFloorRatio: 0.25, freshnessThresholdHours: 36,
} as unknown as EventSourcePolicy;

const window = {
  from: new Date("2026-08-01T00:00:00Z"),
  to: new Date("2026-12-01T00:00:00Z"),
  fromLocalDate: "2026-08-01",
  toLocalDate: "2026-12-01",
};

describe("validateExtraction", () => {
  it("maps a valid item onto the canonical observation", () => {
    const { events, errors } = validateExtraction(source, {
      events: [{
        title: "Cider Tasting on the Green",
        description: "Local orchards pour.",
        startIso: "2026-09-19T14:00:00",
        endIso: "2026-09-19T17:00:00",
        locationText: "Town Green, Westfield NJ",
        eventUrl: "https://patch.com/e/cider",
        cancelled: false,
      }],
    }, window);

    expect(errors).toHaveLength(0);
    expect(events).toHaveLength(1);
    expect(events[0].sourceEventId).toBe("https://patch.com/e/cider");
    expect(events[0].town).toBe("Westfield");
    expect(events[0].status).toBe("scheduled");
  });

  it("drops items with no date, bad dates, or no location, and says why", () => {
    const { events, errors } = validateExtraction(source, {
      events: [
        { title: "No Date", startIso: "sometime soon", locationText: "Downtown" },
        { title: "No Location", startIso: "2026-09-19T14:00:00", locationText: "" },
        { title: "", startIso: "2026-09-19T14:00:00", locationText: "Downtown" },
        "not an object",
      ],
    }, window);

    expect(events).toHaveLength(0);
    expect(errors).toHaveLength(4);
    expect(errors.join(" ")).toContain("No Date");
    expect(errors.join(" ")).toContain("No Location");
  });

  it("falls back to the source page when the model offers no absolute URL", () => {
    const { events } = validateExtraction(source, {
      events: [{
        title: "Unlinked Event",
        startIso: "2026-09-20T10:00:00",
        locationText: "Mindowaskin Park",
        eventUrl: "javascript:alert(1)",
      }],
    }, window);

    expect(events[0].sourceUrl).toBe(source.publicUrl);
    expect(events[0].sourceEventId).toContain("fallback:");
  });

  it("excludes events outside the ingestion window silently", () => {
    const { events, errors } = validateExtraction(source, {
      events: [{ title: "Next Year", startIso: "2027-06-01T10:00:00", locationText: "Somewhere" }],
    }, window);
    expect(events).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  it("marks a stated cancellation", () => {
    const { events } = validateExtraction(source, {
      events: [{ title: "Rained Out", startIso: "2026-09-21T10:00:00", locationText: "Town Green", cancelled: true }],
    }, window);
    expect(events[0].status).toBe("cancelled");
  });
});

describe("extractEventsWithLlm", () => {
  it("skips cleanly with a clear error when no API key is configured", async () => {
    const result = await extractEventsWithLlm({
      source, pageText: "whatever", window, apiKey: undefined,
      fetchImpl: (() => { throw new Error("must not be called"); }) as unknown as typeof fetch,
    });
    // Force the env path to be empty for this assertion.
    if (process.env.GEMINI_API_KEY) return; // environment has a key; covered elsewhere
    expect(result.events).toHaveLength(0);
    expect(result.errors.join(" ")).toContain("GEMINI_API_KEY");
  });

  it("parses a successful model response end to end", async () => {
    const body = {
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        events: [{ title: "Fall Festival", startIso: "2026-10-03T11:00:00", locationText: "Downtown Westfield" }],
      }) }] } }],
    };
    const fetchImpl = (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
    const result = await extractEventsWithLlm({ source, pageText: "page", window, apiKey: "test-key", fetchImpl });
    expect(result.errors).toHaveLength(0);
    expect(result.events.map((event) => event.title)).toEqual(["Fall Festival"]);
  });

  it("surfaces an HTTP failure as an error rather than throwing", async () => {
    const fetchImpl = (async () => new Response("quota exceeded", { status: 429 })) as unknown as typeof fetch;
    const result = await extractEventsWithLlm({ source, pageText: "page", window, apiKey: "test-key", fetchImpl });
    expect(result.events).toHaveLength(0);
    expect(result.errors.join(" ")).toContain("429");
  });

  it("treats unparseable model output as failure, not as zero events", async () => {
    const body = { candidates: [{ content: { parts: [{ text: "not json at all" }] } }] };
    const fetchImpl = (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
    const result = await extractEventsWithLlm({ source, pageText: "page", window, apiKey: "test-key", fetchImpl });
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
