import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORIGIN,
  checkLocation,
  distanceMiles,
  resolvePlace,
} from "../location-guard";

describe("distanceMiles", () => {
  it("is zero for the same point", () => {
    expect(distanceMiles(DEFAULT_ORIGIN, DEFAULT_ORIGIN)).toBeCloseTo(0, 6);
  });

  it("matches a known separation", () => {
    // Westfield to Cranford is roughly two and a quarter miles.
    const cranford = { latitude: 40.6584, longitude: -74.3046 };
    expect(distanceMiles(DEFAULT_ORIGIN, cranford)).toBeGreaterThan(1.5);
    expect(distanceMiles(DEFAULT_ORIGIN, cranford)).toBeLessThan(3);
  });
});

describe("resolvePlace", () => {
  it("finds a town inside a full address", () => {
    expect(resolvePlace("Town Green, 1 Main St, Westfield, NJ 07090")?.name).toBe("westfield");
  });

  it("prefers the longer name so neighbours are not shadowed", () => {
    expect(resolvePlace("Community Center, South Orange NJ")?.name).toBe("south orange");
    expect(resolvePlace("Casano Center, Roselle Park NJ")?.name).toBe("roselle park");
  });

  it("does not resolve a street name to a distant city", () => {
    // "Newark Avenue" in a local address must not place the event in Newark.
    expect(resolvePlace("120 Newark Avenue, Westfield NJ")?.name).toBe("westfield");
  });

  it("returns null for an unrecognised place", () => {
    expect(resolvePlace("Somewhere Unlisted, Fictionland")).toBeNull();
  });
});

describe("checkLocation", () => {
  it("accepts a local event", () => {
    const verdict = checkLocation({ location: "Mindowaskin Park, Westfield NJ" });
    expect(verdict.status).toBe("within");
  });

  it("accepts a neighbouring town", () => {
    expect(checkLocation({ location: "Cranford Theater, Cranford NJ" }).status).toBe("within");
  });

  it("rejects the aggregator case that motivated this guard", () => {
    // A live aggregator check returned Brooklyn and Manhattan events under a
    // Westfield query, which the pipeline would have filed as Westfield.
    const brooklyn = checkLocation({ location: "Maria Hernandez Park, 92 Irving Ave, Brooklyn" });
    expect(brooklyn.status).toBe("too-far");

    const manhattan = checkLocation({ location: "SVA Theatre, 333 West 23rd Street, New York" });
    expect(manhattan.status).toBe("too-far");
  });

  it("rejects the nearest big city, which sits just outside the default radius", () => {
    // Newark measures 10.6 miles from Westfield, against a 10 mile default. It is
    // the closest rejection, so this test is what fails first if the radius moves.
    const verdict = checkLocation({ location: "Prudential Center, Newark NJ" });
    expect(verdict.status).toBe("too-far");
    expect(verdict).toMatchObject({ miles: expect.closeTo(10.6, 0) });
  });

  it("keeps every genuine neighbour inside the default radius", () => {
    for (const town of [
      "Mountainside NJ", "Garwood NJ", "Cranford NJ", "Scotch Plains NJ", "Fanwood NJ",
      "Clark NJ", "Springfield NJ", "Plainfield NJ", "Summit NJ", "Rahway NJ",
      "Berkeley Heights NJ", "Millburn NJ", "Chatham NJ", "Elizabeth NJ", "Metuchen NJ",
    ]) {
      expect(checkLocation({ location: town }), town).toMatchObject({ status: "within" });
    }
  });

  it("prefers source coordinates over the text", () => {
    // Text says Westfield, coordinates say Brooklyn. Coordinates win.
    const verdict = checkLocation({
      location: "Westfield NJ",
      coordinates: { latitude: 40.6782, longitude: -73.9442 },
    });
    expect(verdict.status).toBe("too-far");
    expect(verdict).toMatchObject({ place: "source-coordinates" });
  });

  it("reports unknown rather than guessing", () => {
    expect(checkLocation({ location: "Somewhere Unlisted" }).status).toBe("unknown");
    expect(checkLocation({ location: "" }).status).toBe("unknown");
  });

  it("honours a caller-supplied radius", () => {
    const tight = checkLocation({ location: "Summit NJ", radiusMiles: 1 });
    expect(tight.status).toBe("too-far");
    const loose = checkLocation({ location: "Summit NJ", radiusMiles: 20 });
    expect(loose.status).toBe("within");
  });

  it("ignores non-finite coordinates and falls back to the text", () => {
    const verdict = checkLocation({
      location: "Westfield NJ",
      coordinates: { latitude: Number.NaN, longitude: Number.NaN },
    });
    expect(verdict.status).toBe("within");
    expect(verdict).toMatchObject({ place: "westfield" });
  });
});
