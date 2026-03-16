import { describe, it, expect } from "vitest";
import { formatReviewerName } from "../format";

describe("formatReviewerName", () => {
  it("formats 'First Last' as 'First L.'", () => {
    expect(formatReviewerName("Alice Smith")).toBe("Alice S.");
  });

  it("uses last part initial for multi-word names", () => {
    expect(formatReviewerName("Mary Jane Watson")).toBe("Mary W.");
  });

  it("returns single name as-is", () => {
    expect(formatReviewerName("Bob")).toBe("Bob");
  });

  it("returns 'A neighbor' for null", () => {
    expect(formatReviewerName(null)).toBe("A neighbor");
  });

  it("returns 'A neighbor' for undefined", () => {
    expect(formatReviewerName(undefined)).toBe("A neighbor");
  });

  it("returns 'A neighbor' for empty string", () => {
    expect(formatReviewerName("")).toBe("A neighbor");
  });

  it("handles extra whitespace", () => {
    expect(formatReviewerName("  Alice   Smith  ")).toBe("Alice S.");
  });
});
