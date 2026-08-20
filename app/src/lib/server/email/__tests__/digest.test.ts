import { describe, expect, it } from "vitest";
import {
  buildDigestEdition,
  selectDigestEvents,
} from "../digest";
import {
  eventFixture,
  FRIDAY,
  preferencesFixture,
} from "./fixtures/digest-fixtures";

describe("Friday digest editions", () => {
  it("holds an edition when inventory is empty", () => {
    const edition = buildDigestEdition({ events: [], now: FRIDAY });

    expect(edition.status).toBe("held");
    expect(edition.holdReason).toBe("empty-inventory");
    expect(edition.genericEventIds).toEqual([]);
  });

  it("holds an edition when all upcoming inventory is stale", () => {
    const edition = buildDigestEdition({
      now: FRIDAY,
      events: [eventFixture({
        id: "stale",
        freshnessStatus: "stale",
        lastVerifiedAt: "2026-08-18T10:00:00.000Z",
      })],
    });

    expect(edition.status).toBe("held");
    expect(edition.holdReason).toBe("stale-inventory");
  });

  it("falls back to the frozen generic list when personalization has too few matches", () => {
    const events = [
      eventFixture({ id: "music", category: "Music", town: "Cranford" }),
      eventFixture({ id: "market", category: "Markets", town: "Summit" }),
      eventFixture({ id: "history", category: "History", town: "Scotch Plains" }),
      eventFixture({ id: "food", category: "Food & Drink", town: "Garwood" }),
    ];
    const edition = buildDigestEdition({ now: FRIDAY, events });
    const selection = selectDigestEvents(
      edition,
      preferencesFixture({ towns: [], interests: ["Music"] }),
      true
    );

    expect(selection.reason).toBe("insufficient-matches");
    expect(selection.personalized).toBe(false);
    expect(selection.eventIds).toEqual(edition.genericEventIds);
  });

  it("ranks personalized matches deterministically from frozen event facts", () => {
    const events = [
      eventFixture({ id: "later", title: "Later music", category: "Music", date: "2026-08-23T14:00:00.000Z" }),
      eventFixture({ id: "local", title: "Local music", category: "Music", town: "Westfield" }),
      eventFixture({ id: "early", title: "Early music", category: "Music", date: "2026-08-22T13:00:00.000Z" }),
      eventFixture({ id: "generic", category: "History", town: "Summit" }),
    ];
    const edition = buildDigestEdition({ now: FRIDAY, events });
    const preferences = preferencesFixture({ interests: ["Music"], towns: ["Westfield"] });

    const first = selectDigestEvents(edition, preferences, true);
    const second = selectDigestEvents(edition, preferences, true);

    expect(first).toEqual(second);
    expect(first.personalized).toBe(true);
    expect(first.eventIds).toEqual(["early", "local", "later"]);
  });
});
