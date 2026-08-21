import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  adminDoc: vi.fn(),
  transitionEventCandidate: vi.fn(),
  sourceSet: vi.fn(),
  sourceGet: vi.fn(),
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken: mocks.verifyIdToken }),
  getAdminDb: () => ({
    collection: (name: string) => ({
      doc: () =>
        name === "config"
          ? { get: mocks.adminDoc }
          : { get: mocks.sourceGet, set: mocks.sourceSet },
    }),
  }),
}));

vi.mock("@/lib/server/ingestion/candidate-lifecycle", () => ({
  transitionEventCandidate: mocks.transitionEventCandidate,
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "ts" },
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("https://westfieldbuzz.com/api/admin/review", {
    method: "POST",
    headers: { authorization: "Bearer token", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin review route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyIdToken.mockResolvedValue({
      uid: "admin-uid", email: "admin@example.com", email_verified: true,
    });
    mocks.adminDoc.mockResolvedValue({ data: () => ({ allowlist: ["admin@example.com"] }) });
  });

  it("publishes an event through the lifecycle when a candidate is approved", async () => {
    // Regression: the route used to stamp reviewStatus directly, which marked a
    // candidate approved without ever creating the event.
    mocks.transitionEventCandidate.mockResolvedValue({ status: "approved", eventId: "event-1" });

    const response = await POST(request({ kind: "event", id: "cand-1", action: "approve" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, reviewStatus: "approved", eventId: "event-1" });
    expect(mocks.transitionEventCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ candidateId: "cand-1", to: "approved", reviewer: "admin-uid" })
    );
    expect(mocks.sourceSet).not.toHaveBeenCalled();
  });

  it("maps reject and suppress onto lifecycle transitions", async () => {
    mocks.transitionEventCandidate.mockResolvedValue({ status: "rejected" });
    await POST(request({ kind: "event", id: "cand-1", action: "reject" }));
    expect(mocks.transitionEventCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "rejected" })
    );
  });

  it("rejects resolve for event candidates, which the state machine has no room for", async () => {
    const response = await POST(request({ kind: "event", id: "cand-1", action: "resolve" }));
    expect(response.status).toBe(400);
    expect(mocks.transitionEventCandidate).not.toHaveBeenCalled();
  });

  it("returns 409 when the transition is not legal from the current status", async () => {
    mocks.transitionEventCandidate.mockRejectedValue(new Error("invalid-candidate-transition"));
    const response = await POST(request({ kind: "event", id: "cand-1", action: "approve" }));
    expect(response.status).toBe(409);
  });

  it("returns 404 when the candidate is gone", async () => {
    mocks.transitionEventCandidate.mockRejectedValue(new Error("candidate-not-found"));
    const response = await POST(request({ kind: "event", id: "cand-1", action: "approve" }));
    expect(response.status).toBe(404);
  });

  it("refuses a caller who is not on the admin allowlist", async () => {
    mocks.adminDoc.mockResolvedValue({ data: () => ({ allowlist: ["someone@else.com"] }) });
    const response = await POST(request({ kind: "event", id: "cand-1", action: "approve" }));
    expect(response.status).toBe(403);
    expect(mocks.transitionEventCandidate).not.toHaveBeenCalled();
  });

  it("keeps source candidates on the review-only path", async () => {
    // Approving a discovered source means reviewed, not trusted to crawl.
    mocks.sourceGet.mockResolvedValue({ exists: true });
    const response = await POST(request({ kind: "source", id: "src-1", action: "approve" }));

    expect(response.status).toBe(200);
    expect(mocks.sourceSet).toHaveBeenCalled();
    expect(mocks.transitionEventCandidate).not.toHaveBeenCalled();
  });
});
