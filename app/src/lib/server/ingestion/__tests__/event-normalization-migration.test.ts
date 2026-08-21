import { describe, expect, it } from "vitest";
import { planEventNormalization } from "../event-normalization-migration";
import { eventIdentityFingerprint } from "../identity";

const valid = { title: "Library talk", date: new Date("2026-08-22T18:00:00Z"), location: "Library", town: "Westfield", sourceId: "library", sourceEventId: "a" };

describe("event normalization migration", () => {
  it("accounts for every raw record in a single exclusive bucket", () => {
    const manifest = planEventNormalization({
      events: [
        { id: "ready", data: { ...valid, title: "Different ready event" } },
        { id: "old-manual", data: { ...valid, title: "Operator-added", sourceId: "manual-admin", sourceEventId: "old-manual" } },
        { id: "missing-evidence", data: { ...valid, sourceEventId: "b" } },
        { id: "malformed", data: { title: "No date" } },
        { id: "duplicate", data: { ...valid, sourceEventId: "c" } },
        { id: "duplicate-2", data: { ...valid, sourceEventId: "d" } },
        { id: "conflict", data: { ...valid, title: "Registry conflict", sourceEventId: "e" } },
      ],
      sourceEventIds: new Set(["ready", "duplicate", "duplicate-2", "conflict"]),
      registry: [{ fingerprint: eventIdentityFingerprint({ ...valid, title: "Registry conflict" }).hash, eventId: "another-event" }], now: new Date("2026-08-20T00:00:00Z"),
    });
    expect(manifest.rows).toHaveLength(7);
    expect(manifest.rows.map((row) => row.id)).toEqual(["conflict", "duplicate", "duplicate-2", "malformed", "missing-evidence", "old-manual", "ready"]);
    expect(manifest.rows.find((row) => row.id === "old-manual")?.classification).toBe("ready");
    expect(manifest.rows.find((row) => row.id === "conflict")?.classification).toBe("conflict");
    expect(manifest.counts.ready + manifest.counts.duplicate + manifest.counts.conflict + manifest.counts["missing-evidence"] + manifest.counts.malformed + manifest.counts.unclassifiable).toBe(7);
    expect(manifest.rows.every((row) => row.beforeHash && row.rollback)).toBe(true);
  });
});
