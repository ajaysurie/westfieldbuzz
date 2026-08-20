import { describe, expect, it } from "vitest";
import type { ExistingSourceEvent, SourceObservation } from "../types";
import { planReconciliation } from "../reconcile";

const checkedAt = new Date("2026-08-19T12:00:00.000Z");

function observation(
  overrides: Partial<SourceObservation> = {}
): SourceObservation {
  return {
    title: "Story time",
    description: "Stories and songs",
    date: new Date("2026-08-22T14:00:00.000Z"),
    endDate: new Date("2026-08-22T15:00:00.000Z"),
    location: "Westfield Memorial Library",
    town: "Westfield",
    category: "Family & Kids",
    status: "scheduled",
    availability: "unknown",
    sourceId: "wml-libcal",
    sourceEventId: "123",
    sourceUrl: "https://example.com/events/123",
    ...overrides,
  };
}

function existing(
  overrides: Partial<ExistingSourceEvent> = {}
): ExistingSourceEvent {
  return {
    id: "event-123",
    ...observation(),
    publicationStatus: "published",
    freshnessStatus: "current",
    lastSeenAt: new Date("2026-08-18T12:00:00.000Z"),
    lastVerifiedAt: new Date("2026-08-18T12:00:00.000Z"),
    missingSince: null,
    missingRunCount: 0,
    ...overrides,
  };
}

describe("planReconciliation", () => {
  it("creates new source events and is idempotent on the next run", () => {
    const first = planReconciliation({
      observations: [observation()],
      existing: [],
      checkedAt,
      complete: true,
      missingGraceRuns: 2,
    });
    expect(first.created).toBe(1);

    const second = planReconciliation({
      observations: [observation()],
      existing: [existing()],
      checkedAt,
      complete: true,
      missingGraceRuns: 2,
    });
    expect(second.verified).toBe(1);
    expect(second.updated).toBe(0);
  });

  it("updates an existing event when the source time changes", () => {
    const changedTime = new Date("2026-08-22T15:00:00.000Z");
    const plan = planReconciliation({
      observations: [observation({ date: changedTime })],
      existing: [existing()],
      checkedAt,
      complete: true,
      missingGraceRuns: 2,
    });

    expect(plan.updated).toBe(1);
    expect(plan.actions[0]).toMatchObject({
      type: "update",
      eventId: "event-123",
      changedFields: ["date"],
    });
  });

  it("immediately carries an explicit source cancellation", () => {
    const plan = planReconciliation({
      observations: [observation({ status: "cancelled" })],
      existing: [existing()],
      checkedAt,
      complete: true,
      missingGraceRuns: 2,
    });

    expect(plan.actions[0]).toMatchObject({
      type: "update",
      changedFields: ["status"],
      event: { status: "cancelled" },
    });
  });

  it("moves absent events through missing grace before stale", () => {
    const first = planReconciliation({
      observations: [],
      existing: [existing()],
      checkedAt,
      complete: true,
      missingGraceRuns: 2,
    });
    expect(first.actions[0]).toMatchObject({
      type: "missing",
      event: { freshnessStatus: "missing", missingRunCount: 1 },
    });

    const second = planReconciliation({
      observations: [],
      existing: [
        existing({
          freshnessStatus: "missing",
          missingRunCount: 1,
          missingSince: checkedAt,
        }),
      ],
      checkedAt,
      complete: true,
      missingGraceRuns: 2,
    });
    expect(second.actions[0]).toMatchObject({
      type: "stale",
      event: { freshnessStatus: "stale", missingRunCount: 2 },
    });
  });

  it("does not mark events missing after an incomplete source fetch", () => {
    const plan = planReconciliation({
      observations: [],
      existing: [existing()],
      checkedAt,
      complete: false,
      missingGraceRuns: 2,
    });
    expect(plan.actions).toEqual([]);
  });

  it("preserves manual overrides while refreshing source facts", () => {
    const plan = planReconciliation({
      observations: [
        observation({
          location: "Library source value",
          description: "Updated source description",
        }),
      ],
      existing: [
        existing({
          location: "Community Room",
          manualOverrides: { location: "Community Room" },
        }),
      ],
      checkedAt,
      complete: true,
      missingGraceRuns: 2,
    });

    expect(plan.actions[0]).toMatchObject({
      type: "update",
      event: {
        location: "Community Room",
        description: "Updated source description",
      },
    });
  });
});

