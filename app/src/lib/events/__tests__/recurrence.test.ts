import { describe, expect, it } from "vitest";
import { detectWeeklyRecurrence } from "../recurrence";

function storytime(id: string, iso: string) {
  return {
    id,
    title: "Preschool Storytime",
    location: "Westfield Memorial Library",
    date: new Date(iso),
  };
}

describe("detectWeeklyRecurrence", () => {
  it("labels occurrences sharing a weekday and start time", () => {
    // Two Tuesdays at 10:30 ET.
    const labels = detectWeeklyRecurrence([
      storytime("a", "2026-09-15T14:30:00Z"),
      storytime("b", "2026-09-22T14:30:00Z"),
      { id: "c", title: "One-off Concert", location: "Mindowaskin Park", date: new Date("2026-09-19T23:00:00Z") },
    ]);
    expect(labels.get("a")).toBe("Every Tuesday");
    expect(labels.get("b")).toBe("Every Tuesday");
    expect(labels.has("c")).toBe(false);
  });

  it("requires distinct days — same-day duplicates are not recurrence", () => {
    const labels = detectWeeklyRecurrence([
      storytime("a", "2026-09-15T14:30:00Z"),
      storytime("b", "2026-09-15T18:00:00Z"),
    ]);
    expect(labels.size).toBe(0);
  });

  it("falls back to Weekly when weekdays differ", () => {
    const labels = detectWeeklyRecurrence([
      storytime("a", "2026-09-15T14:30:00Z"),
      storytime("b", "2026-09-18T14:30:00Z"),
    ]);
    expect(labels.get("a")).toBe("Weekly");
    expect(labels.get("b")).toBe("Weekly");
  });

  it("does not label repeats that drift beyond the time tolerance", () => {
    const labels = detectWeeklyRecurrence([
      storytime("a", "2026-09-15T14:30:00Z"),
      // Tuesday 8 PM ET, six hours later.
      storytime("b", "2026-09-23T00:00:00Z"),
    ]);
    expect(labels.size).toBe(0);
  });

  it("scopes labels to the matching weekday when a title recurs on two rhythms", () => {
    const labels = detectWeeklyRecurrence([
      storytime("a", "2026-09-15T14:30:00Z"),
      storytime("b", "2026-09-22T14:30:00Z"),
      storytime("c", "2026-09-17T14:30:00Z"),
      storytime("d", "2026-09-24T14:30:00Z"),
    ]);
    expect(labels.get("a")).toBe("Every Tuesday");
    expect(labels.get("c")).toBe("Every Thursday");
  });
});
