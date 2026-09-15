import { describe, expect, it } from "vitest";
import { EVENT_SOURCES, sourceById } from "../source-registry";

describe("event source registry", () => {
  it("auto-approves additional first-party JSON-LD calendars", () => {
    expect(EVENT_SOURCES.length).toBeGreaterThan(9);
    expect(sourceById("reeves-reed-jsonld")).toMatchObject({
      type: "jsonld",
      autoApprove: true,
      expectedLayoutMarker: "application/ld+json",
    });
  });

  it("keeps the SOPAC index/detail source bounded and host-pinned", () => {
    expect(sourceById("sopac-jsonld-index")).toMatchObject({
      type: "jsonld-index",
      autoApprove: true,
      group: "nearby-venues",
      allowedHosts: ["sopacnow.org", "www.sopacnow.org"],
    });
  });

  it("auto-approves model-backed sources — the operator opted out of review", () => {
    expect(sourceById("nj-festival-orchestra-llm")).toMatchObject({
      type: "llm-extract",
      autoApprove: true,
    });
  });

  it("keeps session-backed Instagram sources host-pinned", () => {
    expect(sourceById("stage-house-instagram")).toMatchObject({
      type: "instagram-profile",
      autoApprove: true,
      group: "venue-search",
      allowedHosts: ["instagram.com", "www.instagram.com", "i.instagram.com"],
    });
  });
});
