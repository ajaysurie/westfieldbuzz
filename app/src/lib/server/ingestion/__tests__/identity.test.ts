import { describe, expect, it } from "vitest";

import { applyIdentityBackfill, planIdentityBackfill } from "../identity-backfill";
import { eventIdentityFingerprint } from "../identity";

const event = {
  title: "  Café\u00a0Story\tTime ",
  date: new Date("2026-08-22T14:00:00.000Z"),
  location: " Westfield\nMemorial Library ",
  town: "WESTFIELD",
  sourceId: "library",
  sourceEventId: "123",
};

describe("event identity fingerprint", () => {
  it("is stable through Unicode, whitespace, and case presentation differences", () => {
    const first = eventIdentityFingerprint(event);
    const second = eventIdentityFingerprint({
      ...event,
      title: "cafe\u0301 story time",
      location: "westfield memorial library",
      town: "westfield",
    });

    expect(second).toEqual(first);
    expect(first.evidence).toEqual({
      version: "event-identity/v1",
      title: "café story time",
      startAt: "2026-08-22T14:00:00.000Z",
      venue: "westfield memorial library",
      town: "westfield",
    });
  });

  it("changes when the exact start instant or venue changes", () => {
    const fingerprint = eventIdentityFingerprint(event);
    expect(eventIdentityFingerprint({ ...event, date: new Date("2026-08-22T14:01:00.000Z") }).hash)
      .not.toBe(fingerprint.hash);
    expect(eventIdentityFingerprint({ ...event, location: "Other venue" }).hash)
      .not.toBe(fingerprint.hash);
  });
});

describe("identity backfill planning", () => {
  it("is dry-run by default and reports duplicate conflicts without writing", async () => {
    const plan = planIdentityBackfill({
      events: [
        { id: "event-a", ...event },
        { id: "event-b", ...event },
      ],
      sourceEventIds: new Set(["event-a", "event-b"]),
      registry: [],
    });
    const write = async () => {
      throw new Error("dry run must not write");
    };

    expect(plan.entries).toEqual([]);
    expect(plan.duplicateFingerprints).toHaveLength(1);
    await expect(applyIdentityBackfill(plan, write)).resolves.toEqual({
      attempted: 0,
      written: 0,
      skipped: 0,
    });
  });

  it("applies only unambiguous entries and skips planned conflicts", async () => {
    const fingerprint = eventIdentityFingerprint(event).hash;
    const plan = planIdentityBackfill({
      events: [
        { id: "safe", ...event },
        { id: "conflict", ...event, title: "Different", identityFingerprint: fingerprint },
      ],
      sourceEventIds: new Set(["safe", "conflict"]),
      registry: [],
    });
    const written: string[] = [];
    const result = await applyIdentityBackfill(plan, async (entry) => {
      written.push(entry.event.id);
      return true;
    }, true);

    expect(plan.fieldConflicts.map((entry) => entry.eventId)).toEqual(["conflict"]);
    expect(written).toEqual(["safe"]);
    expect(result).toEqual({ attempted: 1, written: 1, skipped: 0 });
  });

  it("accounts for legacy records missing the new identity evidence", () => {
    const plan = planIdentityBackfill({
      events: [{ id: "missing", title: "Old event" }],
      sourceEventIds: new Set(),
      registry: [],
    });
    expect(plan.entries).toEqual([]);
    expect(plan.invalidEvents).toEqual([{ eventId: "missing", reason: "malformed" }]);
  });
});
