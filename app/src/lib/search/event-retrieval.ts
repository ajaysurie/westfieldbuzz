import type {
  EventAvailability,
  EventCategory,
  EventFreshness,
  EventStatus,
} from "@/lib/events/types";
import {
  SEARCH_TIME_ZONE,
  localDateString,
  type SearchIntent,
  type TimeOfDay,
} from "./event-intent";

export const MAX_RETRIEVED_EVENTS = 250;
export const DEFAULT_SEARCH_HORIZON_DAYS = 90;

export interface SearchableEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  endDate: string | null;
  location: string;
  town: string;
  category: EventCategory;
  status: EventStatus;
  availability: EventAvailability;
  publicationStatus: "published";
  freshnessStatus: EventFreshness;
  sourceUrl: string;
  sourceId: string;
  lastVerifiedAt: string;
  tags: string[];
  minAge: number | null;
  maxAge: number | null;
  costAmount: number | null;
  isFree: boolean | null;
  environment: "indoor" | "outdoor" | null;
  registration: "required" | "drop-in" | null;
  accessibility: string[];
  driveMinutes: number | null;
}
export interface EventQueryWindow {
  from: Date;
  to: Date;
  limit: number;
}

export interface EventRepository {
  listPublishedEvents(window: EventQueryWindow): Promise<SearchableEvent[]>;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function localBoundary(date: string, endOfDay = false): Date {
  // America/New_York is UTC-04 in summer and UTC-05 in winter. Noon-based
  // conversion lets Intl determine the local calendar date, then we walk to
  // the requested boundary without requiring a timezone dependency.
  const targetHour = endOfDay ? 23 : 0;
  let guess = new Date(`${date}T${String(targetHour).padStart(2, "0")}:${endOfDay ? "59:59.999" : "00:00.000"}Z`);
  for (let index = 0; index < 3; index += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: SEARCH_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(guess);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const rendered = `${value("year")}-${String(value("month")).padStart(2, "0")}-${String(value("day")).padStart(2, "0")}`;
    const dayDelta = Math.round(
      (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${rendered}T12:00:00Z`)) /
        86_400_000
    );
    const hourDelta = targetHour - value("hour");
    guess = new Date(guess.valueOf() + dayDelta * 86_400_000 + hourDelta * 3_600_000);
  }
  return guess;
}

export function queryWindowForIntent(
  intent: SearchIntent,
  now = new Date()
): EventQueryWindow {
  const today = localDateString(now);
  const startDate = intent.dateWindow?.startDate ?? today;
  const endDate = intent.dateWindow?.endDate;
  const from = localBoundary(startDate);
  const to = endDate
    ? localBoundary(endDate, true)
    : addDays(localBoundary(today, true), DEFAULT_SEARCH_HORIZON_DAYS);
  return { from, to, limit: MAX_RETRIEVED_EVENTS };
}

function eventLocalParts(dateString: string): { date: string; hour: number } | null {
  const date = new Date(dateString);
  if (Number.isNaN(date.valueOf())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SEARCH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    date: `${value("year")}-${String(value("month")).padStart(2, "0")}-${String(value("day")).padStart(2, "0")}`,
    hour: value("hour"),
  };
}

function matchesTimeOfDay(hour: number, requested: TimeOfDay[]): boolean {
  return requested.some((part) => {
    if (part === "morning") return hour >= 5 && hour < 12;
    if (part === "afternoon") return hour >= 12 && hour < 17;
    return hour >= 17 || hour < 5;
  });
}

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

export function eventMatchesIntent(
  event: SearchableEvent,
  intent: SearchIntent
): boolean {
  if (
    event.publicationStatus !== "published" ||
    event.freshnessStatus !== "current" ||
    !["scheduled", "rescheduled"].includes(event.status) ||
    event.availability === "sold-out"
  ) {
    return false;
  }

  const local = eventLocalParts(event.date);
  if (!local) return false;
  if (
    intent.dateWindow &&
    (local.date < intent.dateWindow.startDate ||
      local.date > intent.dateWindow.endDate)
  ) {
    return false;
  }
  if (intent.timeOfDay.length && !matchesTimeOfDay(local.hour, intent.timeOfDay)) {
    return false;
  }
  if (intent.towns.length && !intent.towns.some((town) => normalized(town) === normalized(event.town))) {
    return false;
  }
  if (intent.categories.length && !intent.categories.includes(event.category)) {
    return false;
  }
  if (intent.exclusions.categories.includes(event.category)) return false;

  const haystack = normalized(`${event.title} ${event.description} ${event.tags.join(" ")}`);
  if (intent.exclusions.keywords.some((word) => haystack.includes(normalized(word)))) {
    return false;
  }
  if (intent.partyAges.length) {
    if (event.minAge == null && event.maxAge == null) return false;
    if (
      intent.partyAges.some(
        (age) =>
          (event.minAge != null && age < event.minAge) ||
          (event.maxAge != null && age > event.maxAge)
      )
    ) {
      return false;
    }
  }
  if (intent.environment && event.environment !== intent.environment) return false;
  if (intent.maxDriveMinutes != null) {
    if (event.driveMinutes == null || event.driveMinutes > intent.maxDriveMinutes) return false;
  }
  if (intent.budget?.freeOnly && event.isFree !== true) return false;
  if (intent.budget?.maxAmount != null && !intent.budget.freeOnly) {
    if (event.costAmount == null || event.costAmount > intent.budget.maxAmount) return false;
  }
  if (intent.registration && event.registration !== intent.registration) return false;
  if (intent.availability.length && !intent.availability.includes(event.availability as never)) {
    return false;
  }
  if (
    intent.accessibility.length &&
    !intent.accessibility.every((need) => event.accessibility.includes(need))
  ) {
    return false;
  }
  return true;
}

export function filterEvents(
  events: SearchableEvent[],
  intent: SearchIntent
): SearchableEvent[] {
  return events.filter((event) => eventMatchesIntent(event, intent));
}
