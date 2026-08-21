import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import type { EventSourcePolicy } from "../types";

const mocks = vi.hoisted(() => ({
  fetchSourceEvents: vi.fn(),
  reconcileSource: vi.fn(),
}));

vi.mock("../adapters", () => ({ fetchSourceEvents: mocks.fetchSourceEvents }));
vi.mock("../firestore-repository", () => ({ reconcileSource: mocks.reconcileSource }));

import { runIngestion } from "../runner";

class FakeReference {
  constructor(
    private readonly path: string,
    private readonly failures: string[],
    private readonly writes: { path: string; data: Record<string, unknown> }[]
  ) {}
  collection(name: string) { return new FakeCollection(`${this.path}/${name}`, this.failures, this.writes); }
  async get() { return { exists: false, data: () => ({}) }; }
  async set(data: Record<string, unknown> = {}) {
    if (this.failures.some((segment) => this.path.includes(segment))) {
      throw new Error(`write failed for ${this.path}`);
    }
    this.writes.push({ path: this.path, data });
  }
}

class FakeCollection {
  constructor(
    private readonly path: string,
    private readonly failures: string[],
    private readonly writes: { path: string; data: Record<string, unknown> }[]
  ) {}
  doc(id: string) { return new FakeReference(`${this.path}/${id}`, this.failures, this.writes); }
}

class FakeFirestore {
  readonly writes: { path: string; data: Record<string, unknown> }[] = [];
  constructor(private readonly failures: string[] = []) {}
  collection(name: string) { return new FakeCollection(name, this.failures, this.writes); }
}

function source(id: string): EventSourcePolicy {
  return {
    id, name: id, type: "ical", url: `https://example.com/${id}.ics`, town: "Westfield",
    timezone: "America/New_York", autoApprove: true, missingGraceRuns: 2,
    group: "core-libraries", allowedHosts: ["example.com"], expectedContentTypes: ["text/calendar"],
    timeoutMs: 1_000, maxResponseBytes: 1_000, freshnessThresholdHours: 24,
  };
}

const window = {
  from: new Date("2026-08-20T00:00:00.000Z"), to: new Date("2026-08-21T00:00:00.000Z"),
  fromLocalDate: "2026-08-20", toLocalDate: "2026-08-20",
};

function successfulFetch() {
  return { events: [], complete: true, errors: [], warnings: [], responseBytes: 0, fetchedUrl: "https://example.com/feed.ics" };
}

describe("runIngestion runtime bounds", () => {
  beforeEach(() => {
    mocks.fetchSourceEvents.mockReset();
    mocks.reconcileSource.mockReset();
  });

  it("runs no more than two sources concurrently and returns source order", async () => {
    let active = 0;
    let maximum = 0;
    mocks.fetchSourceEvents.mockImplementation(async ({ source: item }: { source: EventSourcePolicy }) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, item.id === "slow" ? 35 : 5));
      active -= 1;
      return successfulFetch();
    });
    mocks.reconcileSource.mockResolvedValue({ created: 0, updated: 0, verified: 0, missing: 0, stale: 0, candidates: 0, safetyHeld: false });

    const result = await runIngestion({
      db: new FakeFirestore() as unknown as Firestore,
      sources: [source("slow"), source("fast-a"), source("fast-b")], window, write: false,
    });

    expect(maximum).toBe(2);
    expect(result.sourceResults.map((item) => item.sourceId)).toEqual(["slow", "fast-a", "fast-b"]);
    expect(result.sourceResults.every((item) => item.status === "success")).toBe(true);
  });

  it("does not start sources once only cleanup reserve remains", async () => {
    mocks.fetchSourceEvents.mockResolvedValue(successfulFetch());
    mocks.reconcileSource.mockResolvedValue({ created: 0, updated: 0, verified: 0, missing: 0, stale: 0, candidates: 0, safetyHeld: false });
    const result = await runIngestion({
      db: new FakeFirestore() as unknown as Firestore,
      sources: [source("a"), source("b")], window, write: false,
      deadlineAt: new Date(Date.now() + 1_000),
    });

    expect(mocks.fetchSourceEvents).not.toHaveBeenCalled();
    expect(result.sourceResults.map((item) => item.errors[0])).toEqual([
      "Global crawl deadline exhausted before source could start",
      "Global crawl deadline exhausted before source could start",
    ]);
  });

  it("keeps reconciliation successful when health persistence fails and continues later sources", async () => {
    mocks.fetchSourceEvents.mockResolvedValue(successfulFetch());
    mocks.reconcileSource.mockResolvedValue({ created: 0, updated: 0, verified: 0, missing: 0, stale: 0, candidates: 0, safetyHeld: false });
    const result = await runIngestion({
      db: new FakeFirestore(["eventSourceHealth/"]) as unknown as Firestore,
      sources: [source("a"), source("b")], window, write: true,
    });

    expect(mocks.reconcileSource).toHaveBeenCalledTimes(2);
    expect(result.sourceResults.every((item) => item.status === "success")).toBe(true);
    expect(result.sourceResults.every((item) => item.warnings.some((warning) => warning.startsWith("Health persistence failed")))).toBe(true);
  });

  it("persists per-source reconciliation counts for operator health visibility", async () => {
    mocks.fetchSourceEvents.mockResolvedValue(successfulFetch());
    mocks.reconcileSource.mockResolvedValue({
      created: 2, updated: 3, verified: 4, missing: 5, stale: 6, candidates: 7, safetyHeld: false,
    });
    const db = new FakeFirestore();

    await runIngestion({
      db: db as unknown as Firestore,
      sources: [source("a")], window, write: true, runId: "run-a",
    });

    expect(db.writes.find((write) => write.path === "eventSourceHealth/a")?.data).toMatchObject({
      fetched: 0, created: 2, updated: 3, verified: 4, missing: 5, stale: 6, candidates: 7,
    });
  });

  it("reports an incomplete reconciliation as partial instead of claiming success", async () => {
    mocks.fetchSourceEvents.mockResolvedValue(successfulFetch());
    mocks.reconcileSource.mockResolvedValue({
      created: 1, updated: 0, verified: 0, missing: 0, stale: 0, candidates: 0,
      safetyHeld: true, incomplete: true,
    });
    const result = await runIngestion({
      db: new FakeFirestore() as unknown as Firestore, sources: [source("a")], window, write: false,
    });
    expect(result).toMatchObject({ status: "partial" });
    expect(result.sourceResults[0]).toMatchObject({ status: "partial", incomplete: true, created: 1, missing: 0 });
  });

  it("continues after one per-source ledger write fails", async () => {
    mocks.fetchSourceEvents.mockResolvedValue(successfulFetch());
    mocks.reconcileSource.mockResolvedValue({ created: 0, updated: 0, verified: 0, missing: 0, stale: 0, candidates: 0, safetyHeld: false });
    const result = await runIngestion({
      db: new FakeFirestore(["crawlRuns/run-a/sources/"]) as unknown as Firestore,
      sources: [source("a"), source("b")], window, write: true, runId: "run-a",
    });

    expect(mocks.reconcileSource).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("success");
    expect(result.warnings).toHaveLength(2);
  });
});
