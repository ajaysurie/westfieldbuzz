import { describe, expect, it } from "vitest";
import { publicEventQueryRange } from "@/lib/events/query-range";

describe("event page query windows", () => {
  it("queries the selected agenda day exactly instead of a fixed today window", () => {
    const range = publicEventQueryRange({
      view: "agenda",
      month: 0,
      year: 2026,
      selectedDate: "2027-02-14",
    });

    expect(range.from.getFullYear()).toBe(2027);
    expect(range.from.getMonth()).toBe(1);
    expect(range.from.getDate()).toBe(14);
    expect(range.to.getTime()).toBeGreaterThan(range.from.getTime());
    expect(range.to.getDate()).toBe(14);
  });

  it("queries the visible calendar month with six-week spillover", () => {
    const range = publicEventQueryRange({
      view: "calendar",
      month: 7,
      year: 2026,
      selectedDate: "2026-08-15",
    });

    expect(range.from).toEqual(new Date(2026, 6, 26));
    expect(range.to.getFullYear()).toBe(2026);
    expect(range.to.getMonth()).toBe(8);
    expect(range.to.getDate()).toBe(5);
  });
});
