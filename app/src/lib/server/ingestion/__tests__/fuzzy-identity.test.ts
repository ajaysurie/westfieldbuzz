import { describe, expect, it } from "vitest";

import {
  scoreFuzzyDuplicate,
  titleSimilarity,
  venueSimilarity,
} from "../fuzzy-identity";

// Real duplicate pairs observed on the Westfield Buzz homepage: the same
// Saturday 7:30 PM concert ingested from two sources with different titles
// and venue prose.
const latinJazzA = {
  title:
    "LATIN JAZZ @ GALERIA Concert Series: A Flamenco/Jazz & Pop event with the acclaimed ALBA MUSIK Group",
  location: "GALERIA, 111 Quimby Street in downtown Westfield, NJ",
  date: new Date("2026-09-19T23:30:00.000Z"), // 7:30 PM ET
};
const latinJazzB = {
  title: "Latin Jazz at Galeria",
  location:
    "Galeria The Art Venue & Framing Galeria West, 111 Quimby St, Westfield, NJ",
  date: new Date("2026-09-19T23:30:00.000Z"),
};

const festiFallA = {
  title: "FestiFall by The Chamber of Commerce",
  location: "Westfield NJ 07090",
  date: new Date("2026-09-20T14:00:00.000Z"), // 10:00 AM ET
};
const festiFallB = {
  title: "FestiFall Street Fair",
  location: "Central Avenue, Downtown Westfield, Westfield, NJ 07090",
  date: new Date("2026-09-20T14:00:00.000Z"),
};

// A distinct sub-event at the same fair: shares the word "FestiFall" and the
// town, but a different venue and title.
const rialtoTable = {
  title: "Festifall: Visit the Rialto Table",
  location: "Rialto Center for Creativity, 250 East Broad Street, Westfield, NJ",
  date: new Date("2026-09-20T14:00:00.000Z"),
};

describe("scoreFuzzyDuplicate", () => {
  it("matches the same concert described differently by two sources", () => {
    const result = scoreFuzzyDuplicate(latinJazzA, latinJazzB);
    expect(result.duplicate).toBe(true);
    expect(result.titleScore).toBe(1);
    expect(result.venueScore).toBe(1);
  });

  it("is symmetric", () => {
    expect(scoreFuzzyDuplicate(latinJazzB, latinJazzA).duplicate).toBe(true);
  });

  it("matches the same street fair under different names at the same address area", () => {
    const result = scoreFuzzyDuplicate(festiFallA, festiFallB);
    expect(result.duplicate).toBe(true);
    expect(result.venueScore).toBe(1);
  });

  it("does not merge a distinct sub-event at the same fair", () => {
    const result = scoreFuzzyDuplicate(rialtoTable, festiFallB);
    expect(result.duplicate).toBe(false);
  });

  it("does not match the same title on different days (recurring events)", () => {
    const nextWeek = {
      ...latinJazzB,
      date: new Date("2026-09-26T23:30:00.000Z"),
    };
    expect(scoreFuzzyDuplicate(latinJazzA, nextWeek).duplicate).toBe(false);
  });

  it("does not match when start times are more than an hour apart", () => {
    const later = {
      ...latinJazzB,
      date: new Date("2026-09-20T01:00:00.000Z"), // 9:00 PM ET, same local day
    };
    const result = scoreFuzzyDuplicate(latinJazzA, later);
    expect(result.startDeltaMinutes).toBeGreaterThan(60);
    expect(result.duplicate).toBe(false);
  });

  it("does not match different events at different venues", () => {
    const other = {
      title: "Latin Jazz Night",
      location: "Crossroads, 78 North Ave, Garwood, NJ",
      date: new Date("2026-09-19T23:30:00.000Z"),
    };
    expect(scoreFuzzyDuplicate(latinJazzB, other).duplicate).toBe(false);
  });

  it("tolerates a small start-time skew between sources", () => {
    const skewed = {
      ...latinJazzB,
      date: new Date("2026-09-19T23:45:00.000Z"), // one feed says 7:45 PM
    };
    expect(scoreFuzzyDuplicate(latinJazzA, skewed).duplicate).toBe(true);
  });
});

describe("venueSimilarity", () => {
  it("expands street abbreviations before comparing", () => {
    expect(venueSimilarity("111 Quimby St, Westfield", "111 Quimby Street, Westfield")).toBe(1);
  });

  it("matches on shared street address despite different venue prose", () => {
    expect(
      venueSimilarity(
        "Bull N Bear Brewery",
        "Bull N Bear Brewery, 1401 Oak Tree Rd, Edison"
      )
    ).toBeGreaterThanOrEqual(0.6);
  });
});

describe("titleSimilarity", () => {
  it("treats a short title contained in a long billing as a full match", () => {
    expect(titleSimilarity("Latin Jazz at Galeria", latinJazzA.title)).toBe(1);
  });

  it("ignores case, punctuation, and stopwords", () => {
    expect(titleSimilarity("MOANA SING-ALONG", "Moana Sing-Along: Popcorn & Pajamas")).toBe(1);
  });
});
