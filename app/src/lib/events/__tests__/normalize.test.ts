import { describe, expect, it } from "vitest";
import { normalizeCategory, normalizeWhitespace } from "../normalize";

describe("event normalization", () => {
  it("maps legacy and ingested categories to one taxonomy", () => {
    expect(normalizeCategory("Family")).toBe("Family & Kids");
    expect(normalizeCategory("Arts")).toBe("Arts & Culture");
    expect(normalizeCategory("Sports")).toBe("Sports & Recreation");
    expect(normalizeCategory("Food")).toBe("Food & Drink");
  });

  it("normalizes whitespace without changing content", () => {
    expect(normalizeWhitespace("  Family   story\n time  ")).toBe(
      "Family story time"
    );
  });
});

