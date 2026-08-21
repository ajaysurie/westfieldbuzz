import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  getAdminDb: vi.fn(() => ({ kind: "db" })),
  saveAndLinkPreferences: vi.fn(),
  validatePreferences: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken: mocks.verifyIdToken }),
  getAdminDb: mocks.getAdminDb,
}));

vi.mock("@/lib/server/account/preferences", () => ({
  saveAndLinkPreferences: mocks.saveAndLinkPreferences,
  validatePreferences: mocks.validatePreferences,
}));

import { POST } from "./route";

function request(body: string | Record<string, unknown>, token?: string) {
  return new Request("https://westfieldbuzz.com/api/account/preferences", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/account/preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validatePreferences.mockReturnValue({ personalizeFriday: true });
    mocks.saveAndLinkPreferences.mockResolvedValue({ linked: true });
  });

  it.each([
    ["missing", undefined],
    ["invalid", "invalid-token"],
    ["revoked", "revoked-token"],
  ])("rejects a %s token with the same sign-in response", async (_kind, token) => {
    if (token) mocks.verifyIdToken.mockRejectedValue(new Error("expired"));

    const response = await POST(request({ preferences: {} }, token));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: token ? "Your sign-in expired. Please sign in again." : "Sign in to save preferences.",
    });
  });

  it("requires a verified email", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "reader", email: "reader@example.com", email_verified: false });

    const response = await POST(request({ preferences: {} }, "token"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: "Verify your email before saving preferences.",
    });
  });

  it("rejects malformed JSON and invalid preference bodies", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "reader", email: "reader@example.com", email_verified: true });
    const malformed = await POST(request("not-json", "token"));
    expect(malformed.status).toBe(400);

    mocks.validatePreferences.mockReturnValue(null);
    const invalid = await POST(request({ preferences: { towns: "Westfield" } }, "token"));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ ok: false, message: "Preferences were invalid." });
  });

  it("saves for a verified account and exposes only the boolean linkage result", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "reader", email: " Reader@Example.com ", email_verified: true });
    mocks.saveAndLinkPreferences.mockResolvedValue({ linked: false });

    const response = await POST(request({ preferences: { towns: ["Westfield"] } }, "token"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, linked: false });
    expect(mocks.saveAndLinkPreferences).toHaveBeenCalledWith(expect.objectContaining({
      account: { uid: "reader", email: "reader@example.com" },
    }));
  });

  it("returns a controlled response when preference persistence fails", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "reader", email: "reader@example.com", email_verified: true });
    mocks.saveAndLinkPreferences.mockRejectedValue(new Error("Firestore unavailable"));

    const response = await POST(request({ preferences: {} }, "token"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ ok: false, message: "We could not save your preferences." });
  });
});
