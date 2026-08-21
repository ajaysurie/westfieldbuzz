import { describe, expect, it } from "vitest";
import { canTransitionCandidate } from "../candidate-lifecycle";

describe("candidate lifecycle", () => {
  it("allows only explicit reviewer transitions", () => {
    expect(canTransitionCandidate("pending", "approved")).toBe(true);
    expect(canTransitionCandidate("rejected", "reopened")).toBe(true);
    expect(canTransitionCandidate("approved", "pending")).toBe(false);
    expect(canTransitionCandidate("suppressed", "approved")).toBe(false);
  });
});
