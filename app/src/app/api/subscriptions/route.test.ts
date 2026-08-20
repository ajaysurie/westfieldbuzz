import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class TimeoutError extends Error {}
  return {
    TimeoutError,
    verifyIdToken: vi.fn(),
    getAdminDb: vi.fn(() => ({ kind: "db" })),
    enforceSignupRateLimit: vi.fn(),
    requestSubscription: vi.fn(),
    recordConfirmationAttempt: vi.fn(),
    confirmationAttemptDetails: vi.fn(),
    recordConfirmationFailed: vi.fn(),
    recordConfirmationAccepted: vi.fn(),
    normalizeEmail: vi.fn((value: string) => value.trim().toLowerCase() || null),
    issueEmailToken: vi.fn(() => "signed-token"),
    saveAndLinkPreferences: vi.fn(),
    sendSubscriptionConfirmation: vi.fn(),
  };
});

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken: mocks.verifyIdToken }),
  getAdminDb: mocks.getAdminDb,
}));
vi.mock("@/lib/server/account/preferences", () => ({ saveAndLinkPreferences: mocks.saveAndLinkPreferences }));
vi.mock("@/lib/server/email/rate-limit", () => ({ enforceSignupRateLimit: mocks.enforceSignupRateLimit }));
vi.mock("@/lib/server/email/subscribers", () => ({
  requestSubscription: mocks.requestSubscription,
  recordConfirmationAttempt: mocks.recordConfirmationAttempt,
  confirmationAttemptDetails: mocks.confirmationAttemptDetails,
  recordConfirmationFailed: mocks.recordConfirmationFailed,
  recordConfirmationAccepted: mocks.recordConfirmationAccepted,
}));
vi.mock("@/lib/server/email/tokens", () => ({
  normalizeEmail: mocks.normalizeEmail,
  issueEmailToken: mocks.issueEmailToken,
}));
vi.mock("@/lib/server/email/sender", () => ({
  EmailProviderTimeoutError: mocks.TimeoutError,
  sendSubscriptionConfirmation: mocks.sendSubscriptionConfirmation,
}));

import { POST } from "./route";

function request(token?: string) {
  return new Request("https://westfieldbuzz.com/api/subscriptions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ email: " Reader@Example.com " }),
  });
}

const subscriber = { id: "subscriber-1", email: "reader@example.com", tokenVersion: 4 };

describe("POST /api/subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceSignupRateLimit.mockResolvedValue(true);
    mocks.requestSubscription.mockResolvedValue({ confirmationRequired: true, subscriber });
    mocks.recordConfirmationAttempt.mockResolvedValue("confirmation-1");
    mocks.confirmationAttemptDetails.mockResolvedValue({ confirmationUrl: "https://westfieldbuzz.com/subscribe/confirm?token=signed-token", idempotencyKey: "confirm/subscriber-1/4" });
    mocks.sendSubscriptionConfirmation.mockResolvedValue("provider-1");
    mocks.recordConfirmationAccepted.mockResolvedValue(undefined);
  });

  it("records a definite provider rejection and returns a controlled 503", async () => {
    mocks.sendSubscriptionConfirmation.mockRejectedValue(new Error("Resend rejected sender"));

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ ok: false, message: "We couldn't start your signup. Please try again." });
    expect(mocks.recordConfirmationFailed).toHaveBeenCalledWith(expect.objectContaining({
      deliveryId: "confirmation-1",
      subscriber,
      error: "Resend rejected sender",
    }));
  });

  it("keeps an ambiguous timeout as an attempt instead of recording a definite failure", async () => {
    mocks.sendSubscriptionConfirmation.mockRejectedValue(new mocks.TimeoutError("timeout"));

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.recordConfirmationAttempt).toHaveBeenCalledTimes(1);
    expect(mocks.recordConfirmationFailed).not.toHaveBeenCalled();
  });

  it("records accepted confirmation delivery after a successful provider call", async () => {
    const response = await POST(request());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ ok: true, message: "Check your inbox to confirm Friday's list." });
    expect(mocks.recordConfirmationAccepted).toHaveBeenCalledWith({
      db: { kind: "db" }, deliveryId: "confirmation-1", providerEmailId: "provider-1",
    });
  });

  it("links an optional token only when its verified email matches the submitted email", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "reader", email: "READER@example.com", email_verified: true });

    await POST(request("valid-token"));

    expect(mocks.saveAndLinkPreferences).toHaveBeenCalledWith(expect.objectContaining({
      account: { uid: "reader", email: "reader@example.com" },
    }));

    mocks.saveAndLinkPreferences.mockClear();
    mocks.verifyIdToken.mockResolvedValue({ uid: "other", email: "other@example.com", email_verified: true });
    await POST(request("wrong-email-token"));
    expect(mocks.saveAndLinkPreferences).not.toHaveBeenCalled();
  });

  it.each([
    ["anonymous", undefined],
    ["invalid token", "expired-token"],
  ])("keeps the %s request on the consent flow", async (_kind, token) => {
    if (token) mocks.verifyIdToken.mockRejectedValue(new Error("expired"));

    const response = await POST(request(token));

    expect(response.status).toBe(202);
    expect(mocks.requestSubscription).toHaveBeenCalledWith(expect.objectContaining({
      email: "reader@example.com", source: "public-friday-signup",
    }));
    expect(mocks.recordConfirmationAttempt).toHaveBeenCalledTimes(1);
  });
});
