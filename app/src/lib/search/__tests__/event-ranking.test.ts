import { describe, expect, it } from "vitest";
import { fallbackParseIntent } from "../event-intent";
import { explainMatch } from "../event-explanations";
import { filterEvents } from "../event-retrieval";
import { rankEvents } from "../event-ranking";
import { eventFixture } from "./test-events";

const NOW = new Date("2026-08-19T16:00:00.000Z");

describe("event retrieval and ranking", () => {
  it("never admits an event that violates a known hard constraint", () => {
    const intent = fallbackParseIntent({
      query: "Something indoors Saturday morning for a 5-year-old within 15 minutes",
      now: NOW,
    });
    const matching = eventFixture({
      id: "match",
      title: "Indoor Story Time",
      date: "2026-08-22T14:00:00.000Z",
      category: "Family & Kids",
      minAge: 4,
      maxAge: 7,
      environment: "indoor",
      driveMinutes: 9,
    });
    const wrongSetting = { ...matching, id: "outside", environment: "outdoor" as const };
    const tooFar = { ...matching, id: "far", driveMinutes: 25 };
    const wrongAge = { ...matching, id: "adult", minAge: 18, maxAge: 99 };
    const soldOut = { ...matching, id: "sold", availability: "sold-out" as const };
    expect(filterEvents([wrongSetting, tooFar, wrongAge, soldOut, matching], intent).map((event) => event.id)).toEqual(["match"]);
  });

  it("applies exclusions before scoring", () => {
    const intent = fallbackParseIntent({ query: "Saturday morning, not sports", now: NOW });
    const sport = eventFixture({ id: "sport", title: "Youth Soccer", date: "2026-08-22T14:00:00.000Z", category: "Sports & Recreation" });
    const market = eventFixture({ id: "market", title: "Farmers Market", date: "2026-08-22T14:00:00.000Z", category: "Markets" });
    expect(filterEvents([sport, market], intent).map((event) => event.id)).toEqual(["market"]);
  });

  it("ranks reproducibly with stable tie breaking", () => {
    const intent = fallbackParseIntent({ query: "music Friday night near Cranford", now: NOW });
    const exact = eventFixture({ id: "z-exact", title: "Friday Night Jazz Music", date: "2026-08-21T23:00:00.000Z", town: "Cranford", category: "Music" });
    const partialB = eventFixture({ id: "b", title: "Live Band", date: "2026-08-21T23:00:00.000Z", town: "Cranford", category: "Music" });
    const partialA = { ...partialB, id: "a" };
    const ranked = rankEvents(filterEvents([partialB, exact, partialA], intent), intent, NOW);
    expect(ranked.map((item) => item.event.id)).toEqual(["z-exact", "a", "b"]);
  });

  it("builds explanations only from visible intent and stored event facts", () => {
    const intent = fallbackParseIntent({ query: "free indoor art Saturday for a 7-year-old in Westfield", now: NOW });
    const event = eventFixture({
      id: "art",
      title: "Family Art Lab",
      date: "2026-08-22T17:00:00.000Z",
      town: "Westfield",
      category: "Arts & Culture",
      minAge: 5,
      maxAge: 10,
      environment: "indoor",
      isFree: true,
      costAmount: 0,
    });
    const [ranked] = rankEvents(filterEvents([event], intent), intent, NOW);
    const reason = explainMatch(ranked, intent);
    expect(reason).toMatch(/ages 5–10/i);
    expect(reason).toMatch(/indoor/i);
    expect(reason).not.toMatch(/tickets|space|recommended/i);
  });
});
