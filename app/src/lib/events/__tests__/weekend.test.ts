import { describe, expect, it } from "vitest";
import { weekendWindow } from "../weekend";

// September 2026: the 15th is a Tuesday, 18th a Friday, 19th Saturday,
// 20th Sunday, 21st Monday.

describe("weekendWindow", () => {
  it("targets the coming Friday to Sunday midweek", () => {
    const window = weekendWindow(new Date("2026-09-15T15:00:00Z"));
    expect(window.startKey).toBe("2026-09-18");
    expect(window.endKey).toBe("2026-09-20");
    expect(window.label).toBe("September 18–20");
  });

  it("uses the current weekend on Friday", () => {
    const window = weekendWindow(new Date("2026-09-18T18:00:00Z"));
    expect(window.startKey).toBe("2026-09-18");
    expect(window.endKey).toBe("2026-09-20");
  });

  it("keeps the current weekend but starts the query today on Sunday", () => {
    const window = weekendWindow(new Date("2026-09-20T15:00:00Z"));
    expect(window.endKey).toBe("2026-09-20");
    expect(window.from.toLocaleDateString("en-CA")).toBe("2026-09-20");
  });

  it("advances to next weekend on Monday", () => {
    const window = weekendWindow(new Date("2026-09-21T15:00:00Z"));
    expect(window.startKey).toBe("2026-09-25");
    expect(window.endKey).toBe("2026-09-27");
  });

  it("spans months without breaking the label", () => {
    // Friday Jan 30 to Sunday Feb 1.
    const window = weekendWindow(new Date("2026-01-28T15:00:00Z"));
    expect(window.startKey).toBe("2026-01-30");
    expect(window.endKey).toBe("2026-02-01");
    expect(window.label).toContain("February");
  });
});
