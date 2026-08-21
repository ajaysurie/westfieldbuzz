import { describe, expect, it } from "vitest";
import {
  issueEmailToken,
  normalizeEmail,
  subscriberIdForEmail,
  verifyEmailToken,
} from "../tokens";

describe("email tokens", () => {
  it("normalizes addresses without exposing them as subscriber ids", () => {
    expect(normalizeEmail("  Ajay@Example.COM ")).toBe("ajay@example.com");
    expect(subscriberIdForEmail("ajay@example.com")).toMatch(/^[a-f0-9]{64}$/);
    expect(subscriberIdForEmail("ajay@example.com")).not.toContain("ajay");
  });

  it("rejects invalid addresses", () => {
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
  });

  it("verifies a scoped, unexpired token", () => {
    const now = new Date("2026-08-19T12:00:00Z");
    const token = issueEmailToken({
      subscriberId: "a".repeat(64),
      purpose: "unsubscribe",
      version: 3,
      expiresAt: new Date("2026-08-20T12:00:00Z"),
      secret: "test-secret",
    });
    expect(verifyEmailToken(token, "test-secret", now)).toMatchObject({
      subscriberId: "a".repeat(64),
      purpose: "unsubscribe",
      version: 3,
    });
  });

  it("rejects tampering and expiration", () => {
    const token = issueEmailToken({
      subscriberId: "b".repeat(64),
      purpose: "confirm",
      version: 1,
      expiresAt: new Date("2026-08-20T12:00:00Z"),
      secret: "test-secret",
    });
    expect(verifyEmailToken(`${token}x`, "test-secret", new Date("2026-08-19T12:00:00Z"))).toBeNull();
    expect(verifyEmailToken(token, "test-secret", new Date("2026-08-21T12:00:00Z"))).toBeNull();
  });
});
