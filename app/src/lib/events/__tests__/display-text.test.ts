import { describe, expect, it } from "vitest";
import {
  cleanDescription,
  cleanLocation,
  cleanTitle,
  formatTimeRange,
  townSuffix,
} from "@/lib/events/display-text";

describe("cleanDescription", () => {
  it("strips HTML tags, escaped newlines, and entities", () => {
    expect(cleanDescription("<p>(ages 3-5 with an adult) Wonder &amp; respect [&hellip;]</p>\\n"))
      .toBe("(ages 3-5 with an adult) Wonder & respect […]");
  });

  it("strips tags that were entity-escaped", () => {
    expect(cleanDescription("&lt;p&gt;Live jazz&lt;/p&gt;")).toBe("Live jazz");
  });

  it("drops descriptions that are only a URL", () => {
    expect(cleanDescription("https://www.westfieldnj.gov/calendar.aspx?EID=2438")).toBe("");
    expect(cleanDescription("  https://a.example/x https://b.example/y ")).toBe("");
  });

  it("keeps prose that contains a URL", () => {
    expect(cleanDescription("Tickets at https://tix.example")).toBe("Tickets at https://tix.example");
  });

  it("handles missing values", () => {
    expect(cleanDescription(undefined)).toBe("");
  });
});

describe("cleanLocation", () => {
  it("removes leading separators left by scrapers", () => {
    expect(cleanLocation("- 270 East Broad Street Westfield NJ 07090")).toBe("270 East Broad Street Westfield NJ 07090");
    expect(cleanLocation(" · Galeria, ")).toBe("Galeria");
  });
});

describe("townSuffix", () => {
  it("omits the town when the venue already names it", () => {
    expect(townSuffix("270 East Broad Street Westfield NJ 07090", "Westfield")).toBe("");
  });

  it("keeps the town when the venue does not name it", () => {
    expect(townSuffix("Bull N Bear Brewery", "Summit")).toBe("Summit");
  });

  it("matches whole words only", () => {
    expect(townSuffix("Summitview Hall", "Summit")).toBe("Summit");
  });
});

describe("cleanTitle", () => {
  it("title-cases shouted titles and keeps known acronyms", () => {
    expect(cleanTitle("I'M NOT A COMEDIAN...I'M LENNY BRUCE")).toBe("I'm Not a Comedian...I'm Lenny Bruce");
    expect(cleanTitle("DORA AND THE LOST CITY OF GOLD – A SENSORY FRIENDLY MOVIE EXPERIENCE"))
      .toBe("Dora and the Lost City of Gold – A Sensory Friendly Movie Experience");
    expect(cleanTitle("LIVE AT THE UCPAC WITH A DJ")).toBe("Live at the UCPAC with a DJ");
  });

  it("leaves mixed-case and short titles alone", () => {
    expect(cleanTitle("THE VAN PELT record release show w/ Quiz Show")).toBe("THE VAN PELT record release show w/ Quiz Show");
    expect(cleanTitle("YMCA 5K")).toBe("YMCA 5K");
  });
});

describe("formatTimeRange", () => {
  it("labels midnight-to-11:59 PM spans as all day", () => {
    expect(formatTimeRange("12:00 AM", "11:59 PM")).toBe("All day");
    expect(formatTimeRange("12:00 AM", "")).toBe("All day");
    expect(formatTimeRange("12:00 AM", "2:00 AM")).toBe("12:00 AM\u20132:00 AM");
  });

  it("collapses zero-length ranges", () => {
    expect(formatTimeRange("6:00 PM", "6:00 PM")).toBe("6:00 PM");
    expect(formatTimeRange("6:00 PM", "")).toBe("6:00 PM");
    expect(formatTimeRange("6:00 PM", "8:00 PM")).toBe("6:00 PM–8:00 PM");
  });
});
