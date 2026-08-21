import { describe, expect, it } from "vitest";
import { validatePreferences } from "../preferences";

const preferences = {
  towns: ["Westfield"],
  driveMinutes: 20,
  childAges: [5, 8],
  interests: ["Music"],
  indoorPreference: "either",
  budgetMax: null,
  personalizeFriday: true,
};

describe("validatePreferences", () => {
  it("accepts the bounded account preference payload", () => {
    expect(validatePreferences(preferences)).toEqual(preferences);
  });

  it("rejects unsupported interests and server-shaped malformed data", () => {
    expect(validatePreferences({ ...preferences, interests: ["Anything"] })).toBeNull();
    expect(validatePreferences({ ...preferences, personalizeFriday: "yes" })).toBeNull();
  });
});
