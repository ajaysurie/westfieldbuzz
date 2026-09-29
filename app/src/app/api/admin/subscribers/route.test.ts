import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  adminDoc: vi.fn(),
  listSubscribers: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken: mocks.verifyIdToken }),
  getAdminDb: () => ({ collection: () => ({ doc: () => ({ get: mocks.adminDoc }) }) }),
}));
vi.mock("@/lib/server/subscribers-admin", () => ({ listSubscribers: mocks.listSubscribers }));

import { GET } from "./route";

const list = {
  items: [{ email: "reader@example.com", status: "active", source: "website", signedUpAt: null, confirmedAt: null, unsubscribedAt: null }],
  counts: { active: 1, pending: 0, unsubscribed: 0, suppressed: 0, total: 1 },
};

function request(headers: Record<string, string> = { authorization: "Bearer token" }) {
  return new Request("https://www.westfieldbuzz.com/api/admin/subscribers", { headers });
}

describe("GET /api/admin/subscribers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyIdToken.mockResolvedValue({ uid: "u", email: "admin@example.com", email_verified: true });
    mocks.adminDoc.mockResolvedValue({ data: () => ({ allowlist: ["admin@example.com"] }) });
    mocks.listSubscribers.mockResolvedValue(list);
  });

  it("returns the list to an allowlisted admin, uncached", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, ...list });
  });

  it("refuses requests without a token, without touching the list", async () => {
    const response = await GET(request({}));
    expect(response.status).toBe(403);
    expect(mocks.listSubscribers).not.toHaveBeenCalled();
  });

  it("refuses a signed-in user who is not on the allowlist", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "u2", email: "reader@example.com", email_verified: true });
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(mocks.listSubscribers).not.toHaveBeenCalled();
  });

  it("refuses an admin address that is not verified", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "u", email: "admin@example.com", email_verified: false });
    expect((await GET(request())).status).toBe(403);
  });

  it("returns 503 when the list cannot be read", async () => {
    mocks.listSubscribers.mockRejectedValue(new Error("firestore down"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("firestore down");
  });
});
