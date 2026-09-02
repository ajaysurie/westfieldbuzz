import { describe, expect, it } from "vitest";
import { EVENT_SOURCES, sourceById } from "../source-registry";

describe("event source registry", () => {
  it("auto-approves additional first-party JSON-LD calendars", () => {
    const ids = [
      "nj-festival-orchestra-jsonld",
      "westfield-on-weekends-jsonld",
      "reeves-reed-jsonld",
    ];
    expect(EVENT_SOURCES.length).toBeGreaterThan(9);
    for (const id of ids) {
      expect(sourceById(id)).toMatchObject({
        type: "jsonld",
        autoApprove: true,
        expectedLayoutMarker: "application/ld+json",
      });
    }
  });
});
