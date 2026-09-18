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

  it("pins the Sept 2026 source-expansion sweep to their hosts and auto-approves", () => {
    const ids = [
      "ymca-westfield-llm",
      "ucnj-cultural-llm",
      "fanwood-library-llm",
      "great-awakening-eventbrite",
      "streetfairs-eventbrite",
      "cdc-theatre-llm",
      "wcp-theatre-llm",
      "vivid-stage-llm",
      "steeple-concerts-llm",
      "summit-film-society-llm",
      "vacnj-llm",
    ];
    for (const id of ids) {
      const source = sourceById(id);
      expect(source).toBeDefined();
      expect(source!.autoApprove).toBe(true);
      expect(source!.allowedHosts.length).toBeGreaterThan(0);
      expect(source!.url).toMatch(/^https?:\/\//);
    }
    expect(sourceById("ymca-westfield-llm")).toMatchObject({
      type: "llm-extract",
      town: "Westfield",
      allowedHosts: ["westfieldynj.org", "www.westfieldynj.org"],
    });
    expect(sourceById("fanwood-library-llm")).toMatchObject({
      type: "llm-extract",
      group: "core-libraries",
    });
    for (const id of ["great-awakening-eventbrite", "streetfairs-eventbrite"]) {
      expect(sourceById(id)).toMatchObject({
        type: "eventbrite-organizer",
        autoApprove: true,
        group: "nearby-venues",
        allowedHosts: ["eventbrite.com", "www.eventbrite.com"],
        expectedLayoutMarker: '"upcomingEvents"',
      });
    }
  });
});
