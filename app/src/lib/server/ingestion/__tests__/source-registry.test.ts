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

  it("keeps model-backed sources in the manual-review path", () => {
    expect(sourceById("nj-festival-orchestra-llm")).toMatchObject({
      type: "llm-extract",
      autoApprove: false,
    });
  });

  it("keeps session-backed Instagram sources reviewed and host-pinned", () => {
    expect(sourceById("stage-house-instagram")).toMatchObject({
      type: "instagram-profile",
      autoApprove: false,
      group: "venue-search",
      allowedHosts: ["instagram.com", "www.instagram.com", "i.instagram.com"],
    });
  });
});
