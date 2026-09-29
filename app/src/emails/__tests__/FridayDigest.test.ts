import { describe, expect, it } from "vitest";
import { fridayDigestText } from "../FridayDigest";

const props = {
  issueLabel: "Oct 2",
  intro: "This weekend around Westfield.",
  calendarUrl: "https://www.westfieldbuzz.com/events",
  unsubscribePageUrl: "https://www.westfieldbuzz.com/unsubscribe",
  oneClickUnsubscribeUrl: "https://www.westfieldbuzz.com/api/subscriptions/unsubscribe",
  events: [
    { id: "a", title: "Story Time", when: "Tue 1:00 PM", location: "270 East Broad Street Westfield NJ", town: "Westfield", url: "https://example.com/a" },
    { id: "b", title: "Breeze Brothers", when: "Wed 7:00 PM", location: "Bull N Bear Brewery", town: "Summit", url: "https://example.com/b" },
  ],
};

describe("fridayDigestText", () => {
  it("invites replies as feedback", () => {
    expect(fridayDigestText(props)).toContain("Just reply to this email.");
  });

  it("does not repeat a town the venue already names", () => {
    const text = fridayDigestText(props);
    expect(text).toContain("270 East Broad Street Westfield NJ\n");
    expect(text).toContain("Bull N Bear Brewery · Summit\n");
  });
});
