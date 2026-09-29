import { describe, expect, it } from "vitest";
import {
  countSubscribers,
  csvCell,
  subscribersToCsv,
  type SubscriberListItem,
} from "@/lib/subscribers-admin";

function item(overrides: Partial<SubscriberListItem>): SubscriberListItem {
  return {
    email: "reader@example.com",
    status: "active",
    source: "website",
    signedUpAt: "2026-09-29T14:00:00.000Z",
    confirmedAt: "2026-09-29T14:05:00.000Z",
    unsubscribedAt: null,
    ...overrides,
  };
}

describe("countSubscribers", () => {
  it("counts each status and the total", () => {
    const counts = countSubscribers([
      item({}),
      item({ email: "b@example.com" }),
      item({ email: "c@example.com", status: "pending" }),
      item({ email: "d@example.com", status: "unsubscribed" }),
    ]);
    expect(counts).toEqual({ active: 2, pending: 1, unsubscribed: 1, suppressed: 0, total: 4 });
  });
});

describe("csvCell", () => {
  it("quotes cells with commas, quotes, or newlines", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });

  it("neutralizes spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1@example.com")).toBe("'+1@example.com");
    expect(csvCell("-x@example.com")).toBe("'-x@example.com");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });
});

describe("subscribersToCsv", () => {
  it("writes a header and one row per subscriber", () => {
    const csv = subscribersToCsv([item({}), item({ email: "b@example.com", status: "pending", confirmedAt: null })]);
    expect(csv.split("\r\n")).toEqual([
      "email,status,signed_up,confirmed,unsubscribed,source",
      "reader@example.com,active,2026-09-29T14:00:00.000Z,2026-09-29T14:05:00.000Z,,website",
      "b@example.com,pending,2026-09-29T14:00:00.000Z,,,website",
      "",
    ]);
  });

  it("is just a header for an empty list", () => {
    expect(subscribersToCsv([])).toBe("email,status,signed_up,confirmed,unsubscribed,source\r\n");
  });
});
