import { describe, expect, it } from "vitest";
import { canHardDeleteEvent } from "../hard-delete-event";

describe("hard event deletion", () => {
  it("refuses deletion while source evidence or saves exist", () => {
    expect(canHardDeleteEvent({ sourceEvidence: 1, savedEvents: 0, fingerprintClaim: true })).toBe(false);
    expect(canHardDeleteEvent({ sourceEvidence: 0, savedEvents: 1, fingerprintClaim: false })).toBe(false);
    expect(canHardDeleteEvent({ sourceEvidence: 0, savedEvents: 0, fingerprintClaim: true })).toBe(true);
  });
});
