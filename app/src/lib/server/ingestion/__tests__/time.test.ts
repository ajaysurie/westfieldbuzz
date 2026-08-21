import { describe, expect, it } from "vitest";
import { parseSourceDateTime } from "../time";

describe("parseSourceDateTime", () => {
  it("interprets naive datetimes in the source timezone", () => {
    expect(
      parseSourceDateTime("2026-03-07 10:00:00", "America/New_York").toISOString()
    ).toBe("2026-03-07T15:00:00.000Z");
  });

  it("handles the daylight-saving transition", () => {
    expect(
      parseSourceDateTime("2026-03-08 03:30:00", "America/New_York").toISOString()
    ).toBe("2026-03-08T07:30:00.000Z");
  });

  it("preserves explicit offsets", () => {
    expect(
      parseSourceDateTime("2026-03-08T03:30:00-04:00", "America/New_York").toISOString()
    ).toBe("2026-03-08T07:30:00.000Z");
  });
});

