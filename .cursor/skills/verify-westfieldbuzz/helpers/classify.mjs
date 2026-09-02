/**
 * Classify Westfield Buzz public HTML/text from real UI copy in
 * app/src/app/page.tsx and app/src/app/events/page.tsx.
 * Empty inventory is a valid observation. Load failure is not empty.
 */

export const HOMEPAGE_H1 = /What's on around Westfield/i;
export const WEEK_HEADING = /This week, in order/;
export const WEEK_LOADING = /Checking this week's calendars/;
export const WEEK_ERROR = /We couldn't check the calendar/;
export const WEEK_EMPTY = /This week is still taking shape/;
export const EVENT_CARD_FOOTER = /Verified |Source verification pending|Event details/;

export const EVENTS_H1 = /Plan what's next/;
export const EVENTS_LOADING = /Checking the latest event details/;
export const EVENTS_ERROR = /The calendar did not load/;
export const EVENTS_EMPTY = /No published events yet/;
export const EVENTS_FILTER_EMPTY = /Nothing matches this view|No events on /;

export const FATAL_MARKERS = /couldn't check|Something went wrong|Application error|Internal Server Error/i;

export function classifyHomepageText(text) {
  if (typeof text !== "string" || text.trim().length === 0) {
    return { surface: "homepage", state: "unknown", reason: "empty-body" };
  }
  if (WEEK_ERROR.test(text) || (FATAL_MARKERS.test(text) && !WEEK_EMPTY.test(text))) {
    return { surface: "homepage", state: "error", reason: "calendar-load-failed" };
  }
  if (WEEK_LOADING.test(text) && !WEEK_EMPTY.test(text) && !EVENT_CARD_FOOTER.test(text)) {
    return { surface: "homepage", state: "loading", reason: "still-checking-calendars" };
  }
  if (WEEK_EMPTY.test(text)) {
    return { surface: "homepage", state: "empty", reason: "no-published-events-this-week" };
  }
  if (EVENT_CARD_FOOTER.test(text) || /agenda-day/.test(text)) {
    return { surface: "homepage", state: "populated", reason: "this-week-agenda-has-events" };
  }
  if (HOMEPAGE_H1.test(text) && WEEK_HEADING.test(text)) {
    return { surface: "homepage", state: "shell", reason: "hero-and-week-heading-without-agenda-state" };
  }
  return { surface: "homepage", state: "unknown", reason: "unrecognized-copy" };
}

export function classifyEventsText(text) {
  if (typeof text !== "string" || text.trim().length === 0) {
    return { surface: "events", state: "unknown", reason: "empty-body" };
  }
  if (EVENTS_ERROR.test(text) || FATAL_MARKERS.test(text)) {
    return { surface: "events", state: "error", reason: "calendar-load-failed" };
  }
  if (EVENTS_LOADING.test(text) && !EVENTS_EMPTY.test(text) && !EVENT_CARD_FOOTER.test(text)) {
    return { surface: "events", state: "loading", reason: "still-checking-details" };
  }
  if (EVENTS_EMPTY.test(text)) {
    return { surface: "events", state: "empty", reason: "no-published-events" };
  }
  if (EVENTS_FILTER_EMPTY.test(text)) {
    return { surface: "events", state: "filtered-empty", reason: "filters-or-day-have-no-matches" };
  }
  if (EVENT_CARD_FOOTER.test(text)) {
    return { surface: "events", state: "populated", reason: "agenda-has-event-cards" };
  }
  if (EVENTS_H1.test(text)) {
    return { surface: "events", state: "shell", reason: "heading-without-agenda-state" };
  }
  return { surface: "events", state: "unknown", reason: "unrecognized-copy" };
}

export function classifyCronProbe(status, bodyText) {
  const body = typeof bodyText === "string" ? bodyText : "";
  if (status === 401 || status === 403) {
    return { ok: true, mode: "auth-rejected", status, note: "cron rejected unauthenticated probe (expected on a configured deploy)" };
  }
  if (status === 503) {
    return { ok: true, mode: "disabled-or-unconfigured", status, note: "cron returned 503; local missing CRON_SECRET or job flag off" };
  }
  if (status === 200 || status === 207) {
    return { ok: false, mode: "ran", status, note: "cron ran without a bearer; do not retry with secrets" };
  }
  return { ok: false, mode: "unexpected", status, note: body.slice(0, 200) };
}
