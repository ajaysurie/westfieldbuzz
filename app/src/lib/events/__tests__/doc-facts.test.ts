import { describe, expect, it } from "vitest";
import { costAndAgeLabel, readCostAndAge } from "@/lib/events/doc-facts";

describe("readCostAndAge", () => {
  it("reads flat fields", () => {
    expect(readCostAndAge({ costAmount: 15, minAge: 3, maxAge: 5 }))
      .toEqual({ costAmount: 15, isFree: false, minAge: 3, maxAge: 5 });
  });

  it("reads nested cost and age range", () => {
    expect(readCostAndAge({ cost: { type: "free" }, ageRange: { min: 18 } }))
      .toEqual({ costAmount: null, isFree: true, minAge: 18, maxAge: null });
  });

  it("reports unknown when nothing was listed", () => {
    expect(readCostAndAge({})).toEqual({ costAmount: null, isFree: null, minAge: null, maxAge: null });
  });
});

describe("costAndAgeLabel", () => {
  it("joins cost and ages", () => {
    expect(costAndAgeLabel({ isFree: true, costAmount: 0, minAge: 3, maxAge: 5 })).toBe("Free · Ages 3–5");
    expect(costAndAgeLabel({ isFree: false, costAmount: 12.5, minAge: 21, maxAge: null })).toBe("$12.50 · Ages 21+");
  });

  it("is empty when the source listed neither", () => {
    expect(costAndAgeLabel({ isFree: null, costAmount: null, minAge: null, maxAge: null })).toBe("");
  });
});
