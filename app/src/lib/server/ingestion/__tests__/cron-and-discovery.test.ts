import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { authorizeCron } from "../cron-auth";
import { DISCOVERY_SEEDS, discoverSourceCandidates } from "../discovery";
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
    expect(EVENT_SOURCES).toHaveLength(10);
    expect(EVENT_SOURCES.every((source) => source.allowedHosts.length > 0)).toBe(true);
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
});
