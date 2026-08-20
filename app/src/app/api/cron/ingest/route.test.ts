import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  serverFirestore: vi.fn(),
  acquireLease: vi.fn(),
  releaseLeaseBestEffort: vi.fn(),
  runIngestion: vi.fn(),
}));

vi.mock("@/lib/server/ingestion/cron-auth", () => ({ authorizeCron: () => ({ ok: true }), cronFeatureEnabled: () => true }));
vi.mock("@/lib/server/ingestion/firebase-admin", () => ({ serverFirestore: mocks.serverFirestore }));
vi.mock("@/lib/server/ingestion/lease", () => ({
  acquireLease: mocks.acquireLease,
  releaseLeaseBestEffort: mocks.releaseLeaseBestEffort,
}));
vi.mock("@/lib/server/ingestion/source-registry", () => ({
  isSourceGroup: (group: string) => group === "core-libraries",
}));
vi.mock("@/lib/server/ingestion/source-overrides", () => ({
  resolvedSourcesForGroup: async () => ({ sources: [], warnings: [] }),
}));
vi.mock("@/lib/server/ingestion/community-config", () => ({
  loadCommunityConfig: async () => ({
    location: { origin: { latitude: 0, longitude: 0 }, radiusMiles: 10, places: {} },
    horizonDays: 120,
    warnings: [],
  }),
}));
vi.mock("@/lib/server/ingestion/runner", () => ({
  makeIngestionWindow: vi.fn(() => ({ from: new Date(), to: new Date(), fromLocalDate: "2026-08-20", toLocalDate: "2026-09-19" })),
  runIngestion: mocks.runIngestion,
}));

import { GET } from "./route";

describe("ingest cron cleanup", () => {
  it("preserves the real run response when lease cleanup fails", async () => {
    mocks.serverFirestore.mockReturnValue({});
    mocks.acquireLease.mockResolvedValue({ acquired: true });
    mocks.releaseLeaseBestEffort.mockResolvedValue({ released: false, error: "temporary Firestore error" });
    mocks.runIngestion.mockResolvedValue({
      runId: "run-a", status: "success", sourceResults: [], warnings: [],
      totals: { fetched: 0, created: 0, updated: 0, verified: 0, missing: 0, stale: 0, candidates: 0, safetyHeld: false, errors: 0 },
    });

    const response = await GET(new NextRequest("https://westfieldbuzz.com/api/cron/ingest?group=core-libraries"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ runId: "run-a", status: "success" });
    expect(mocks.releaseLeaseBestEffort).toHaveBeenCalledWith(expect.objectContaining({ key: "event-ingest:core-libraries", owner: expect.any(String) }));
  });
});
