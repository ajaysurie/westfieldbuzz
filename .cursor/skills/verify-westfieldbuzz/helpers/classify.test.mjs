import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyCronProbe,
  classifyEventsText,
  classifyHomepageText,
} from "./classify.mjs";

const HOME_POPULATED = `
What's on around Westfield this week.
This week, in order
Verified Mar 2
Event details →
`;

const HOME_EMPTY = `
What's on around Westfield this week.
This week, in order
This week is still taking shape
No published events are on the board yet.
`;

const HOME_ERROR = `
What's on around Westfield this week.
This week, in order
We couldn't check the calendar
The source data did not load.
`;

const HOME_LOADING = `
What's on around Westfield this week.
This week, in order
Checking this week's calendars
We're loading the latest published event details.
`;

test("homepage populated vs empty vs error vs loading from real copy", () => {
  assert.equal(classifyHomepageText(HOME_POPULATED).state, "populated");
  assert.equal(classifyHomepageText(HOME_EMPTY).state, "empty");
  assert.equal(classifyHomepageText(HOME_ERROR).state, "error");
  assert.equal(classifyHomepageText(HOME_LOADING).state, "loading");
  assert.equal(classifyHomepageText("").state, "unknown");
});

test("empty agenda is not classified as a load error", () => {
  const result = classifyHomepageText(HOME_EMPTY);
  assert.equal(result.state, "empty");
  assert.notEqual(result.state, "error");
});

test("events page copy classification", () => {
  assert.equal(classifyEventsText("Plan what's next.\nChecking the latest event details").state, "loading");
  assert.equal(classifyEventsText("Plan what's next.\nThe calendar did not load").state, "error");
  assert.equal(classifyEventsText("Plan what's next.\nNo published events yet").state, "empty");
  assert.equal(classifyEventsText("Plan what's next.\nVerified Mar 2\nEvent details").state, "populated");
  assert.equal(classifyEventsText("Plan what's next.\nNothing matches this view").state, "filtered-empty");
});

test("cron probe: 401/503 are healthy; 200 is not", () => {
  assert.equal(classifyCronProbe(401, '{"error":"Unauthorized"}').ok, true);
  assert.equal(classifyCronProbe(503, '{"error":"CRON_SECRET is not configured"}').ok, true);
  assert.equal(classifyCronProbe(200, '{"status":"ok"}').ok, false);
  assert.equal(classifyCronProbe(207, "{}").ok, false);
});
