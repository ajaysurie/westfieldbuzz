import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { authorizeCron } from "../cron-auth";
import { DISCOVERY_SEEDS, discoverSourceCandidates, runDiscovery } from "../discovery";
import { leaseIsActive } from "../lease";
import { EVENT_SOURCES, SOURCE_GROUPS } from "../source-registry";
import { countAnomaly } from "../runner";

describe("cron boundaries", () => {
  it("fails closed when CRON_SECRET is missing or incorrect", () => {
    expect(authorizeCron("Bearer anything", undefined)).toMatchObject({
      ok: false,
      status: 503,
    });
    expect(authorizeCron("Bearer wrong", "right")).toMatchObject({
      ok: false,
      status: 401,
    });
    expect(authorizeCron("Bearer right", "right")).toEqual({ ok: true });
  });

  it("treats only unexpired, owned lease data as active", () => {
    const now = new Date("2026-08-20T12:00:00.000Z");
    expect(
      leaseIsActive(
        { owner: "run-a", leaseUntil: Timestamp.fromDate(new Date(now.getTime() + 1_000)) },
        now
      )
    ).toBe(true);
    expect(
      leaseIsActive(
        { owner: "run-a", leaseUntil: Timestamp.fromDate(new Date(now.getTime() - 1)) },
        now
      )
    ).toBe(false);
  });

  it("holds a sharp count drop but accepts normal variation", () => {
    expect(countAnomaly({ previousCount: 20, currentCount: 3, floorRatio: 0.25 })).toContain(
      "fell from 20 to 3"
    );
    expect(countAnomaly({ previousCount: 20, currentCount: 8, floorRatio: 0.25 })).toBeNull();
  });
});

describe("source registry and discovery boundary", () => {
  it("keeps scheduled collection in bounded source groups", () => {
    expect(SOURCE_GROUPS).toEqual([
      "core-libraries",
      "core-town-school",
      "nearby-venues",
    ]);
    // Structural invariants instead of a magic count, which broke on every
    // legitimate addition without protecting anything.
    const ids = EVENT_SOURCES.map((source) => source.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Every source that fetches a page must pin its hosts; llm-search fetches
    // nothing (search grounding is the fetch), so it is exempt by construction.
    expect(EVENT_SOURCES
      .filter((source) => source.type !== "llm-search")
      .every((source) => source.allowedHosts.length > 0)).toBe(true);
    // Model-backed sources always start untrusted; publishing requires the
    // operator toggle in config/sources.
    expect(EVENT_SOURCES
      .filter((source) => source.type === "llm-extract" || source.type === "llm-search")
      .every((source) => source.autoApprove === false)).toBe(true);
    expect(EVENT_SOURCES.find((source) => source.id === "westfield-schools-ical")?.autoApprove).toBe(true);
    expect(EVENT_SOURCES.find((source) => source.id === "ucpac-tribe")?.autoApprove).toBe(false);
  });

  it("emits JSON candidates that can never self-enable", async () => {
    const candidates = await discoverSourceCandidates({
      seeds: [DISCOVERY_SEEDS[0]],
      now: new Date("2026-08-20T12:00:00.000Z"),
      fetchImpl: async () =>
        new Response("<html><title>Community Players</title></html>", {
          headers: { "content-type": "text/html" },
        }),
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      reviewStatus: "pending",
      enabled: false,
      reachable: true,
      evidence: { pageTitle: "Community Players" },
    });
    expect(EVENT_SOURCES.some((source) => source.url === candidates[0].url)).toBe(false);
  });

  it("fetches discovery seeds with concurrency three while preserving seed order", async () => {
    let active = 0;
    let maximum = 0;
    const seeds = DISCOVERY_SEEDS.slice(0, 4);
    const candidates = await discoverSourceCandidates({
      seeds,
      fetchImpl: async (url) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, String(url).includes("ludus") ? 25 : 5));
        active -= 1;
        return new Response("<html><title>Candidate</title></html>", {
          headers: { "content-type": "text/html" },
        });
      },
    });
    expect(maximum).toBe(3);
    expect(candidates.map((candidate) => candidate.name)).toEqual(seeds.map((seed) => seed.name));
  });

  it("does not start discovery seeds after its deadline reserve", async () => {
    const fetchImpl = async () => new Response("<html></html>", {
      headers: { "content-type": "text/html" },
    });
    const candidates = await discoverSourceCandidates({
      seeds: DISCOVERY_SEEDS.slice(0, 2),
      deadlineAt: new Date(Date.now() + 1_000),
      fetchImpl,
    });
    expect(candidates.every((candidate) => !candidate.reachable)).toBe(true);
    expect(candidates.every((candidate) => candidate.evidence.error?.includes("deadline exhausted"))).toBe(true);
  });

  it("does not reset first-seen timestamps when candidate lookup bookkeeping fails", async () => {
    const writes: Array<Record<string, unknown>> = [];
    const collection = (path: string) => ({
      doc: (id: string) => ({
        set: async () => undefined,
        collection: (name: string) => collection(`${path}/${id}/${name}`),
      }),
    });
    const db = {
      collection,
      getAll: async () => { throw new Error("lookup unavailable"); },
      batch: () => ({
        set: (_ref: unknown, value: Record<string, unknown>) => writes.push(value),
        commit: async () => undefined,
      }),
    } as unknown as Firestore;
    const result = await runDiscovery({
      db,
      write: true,
      seeds: [DISCOVERY_SEEDS[0]],
      fetchImpl: async () => new Response("<html></html>", {
        headers: { "content-type": "text/html" },
      }),
    });
    expect(result.status).toBe("success");
    expect(result.warnings).toContain("Candidate lookup failed: lookup unavailable");
    expect(writes).toHaveLength(0);
  });
});
