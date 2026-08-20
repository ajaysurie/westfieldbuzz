import type { EventAvailability, EventCategory, EventFreshness, EventStatus } from "../../events/types";

export const DIGEST_EVENT_LIMIT = 8;
export const DIGEST_CANDIDATE_LIMIT = 60;
export const MIN_PERSONALIZED_MATCHES = 3;
export const INVENTORY_MAX_AGE_HOURS = 36;

export interface DigestEventSnapshot {
  id: string;
  title: string;
  date: string;
  endDate: string | null;
  location: string;
  town: string;
  category: EventCategory;
  status: EventStatus;
  availability: EventAvailability;
  sourceUrl: string;
  publicationStatus: "published";
  freshnessStatus: EventFreshness;
  lastVerifiedAt: string;
  minAge: number | null;
  maxAge: number | null;
  costAmount: number | null;
  isFree: boolean | null;
  environment: "indoor" | "outdoor" | null;
  driveMinutes: number | null;
}

export interface DigestEdition {
  id: string;
  status: "ready" | "held";
  holdReason: "empty-inventory" | "stale-inventory" | null;
  issueLabel: string;
  intro: string;
  createdAt: string;
  inventoryCutoff: string;
  genericEventIds: string[];
  candidateEvents: DigestEventSnapshot[];
}

export interface DigestPreferences {
  towns: string[];
  driveMinutes: number | null;
  childAges: number[];
  interests: EventCategory[];
  indoorPreference: "indoor" | "outdoor" | "either";
  budgetMax: number | null;
  personalizeFriday: boolean;
}

export interface DigestSelection {
  eventIds: string[];
  personalized: boolean;
  reason: "generic" | "personalized" | "insufficient-matches" | "not-enabled";
}

function dateValue(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function stableEventOrder(left: DigestEventSnapshot, right: DigestEventSnapshot): number {
  const titleOrder = left.title < right.title ? -1 : left.title > right.title ? 1 : 0;
  const idOrder = left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  return dateValue(left.date) - dateValue(right.date)
    || titleOrder
    || idOrder;
}

function localDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function digestEditionId(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function eventIsUpcoming(event: DigestEventSnapshot, now: Date, windowEnd: Date): boolean {
  const startsAt = dateValue(event.date);
  return startsAt >= now.getTime() && startsAt <= windowEnd.getTime();
}

function eventIsSendable(event: DigestEventSnapshot): boolean {
  return event.publicationStatus === "published"
    && event.freshnessStatus === "current"
    && event.status !== "cancelled"
    && event.status !== "postponed";
}

export function buildDigestEdition(input: {
  events: DigestEventSnapshot[];
  now: Date;
  id?: string;
  inventoryMaxAgeHours?: number;
}): DigestEdition {
  const id = input.id ?? digestEditionId(input.now);
  const inventoryCutoff = new Date(
    input.now.getTime()
      - (input.inventoryMaxAgeHours ?? INVENTORY_MAX_AGE_HOURS) * 60 * 60 * 1000
  );
  const windowEnd = new Date(input.now.getTime() + 10 * 24 * 60 * 60 * 1000);
  const upcoming = input.events.filter((event) => eventIsUpcoming(event, input.now, windowEnd));
  const current = upcoming
    .filter(eventIsSendable)
    .filter((event) => dateValue(event.lastVerifiedAt) >= inventoryCutoff.getTime())
    .sort(stableEventOrder)
    .slice(0, DIGEST_CANDIDATE_LIMIT);
  const held = current.length === 0;
  const end = current.length > 0
    ? new Date(Math.max(...current.slice(0, DIGEST_EVENT_LIMIT).map((event) => dateValue(event.date))))
    : new Date(input.now.getTime() + 2 * 24 * 60 * 60 * 1000);

  return {
    id,
    status: held ? "held" : "ready",
    holdReason: held
      ? upcoming.some((event) => event.freshnessStatus !== "current"
        || dateValue(event.lastVerifiedAt) < inventoryCutoff.getTime())
        ? "stale-inventory"
        : "empty-inventory"
      : null,
    issueLabel: `${localDateLabel(input.now)} to ${localDateLabel(end)}`,
    intro: "Fresh, source-linked events for the days ahead around Westfield.",
    createdAt: input.now.toISOString(),
    inventoryCutoff: inventoryCutoff.toISOString(),
    genericEventIds: current.slice(0, DIGEST_EVENT_LIMIT).map((event) => event.id),
    candidateEvents: current,
  };
}

function normalizedSet(values: string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function ageMatches(event: DigestEventSnapshot, ages: number[]): boolean {
  if (ages.length === 0) return false;
  if (event.minAge == null && event.maxAge == null) return event.category === "Family & Kids";
  return ages.some((age) =>
    (event.minAge == null || age >= event.minAge)
      && (event.maxAge == null || age <= event.maxAge)
  );
}

function preferenceScore(event: DigestEventSnapshot, preferences: DigestPreferences): number {
  let score = 0;
  if (preferences.interests.includes(event.category)) score += 5;
  if (normalizedSet(preferences.towns).has(event.town.trim().toLowerCase())) score += 4;
  if (ageMatches(event, preferences.childAges)) score += 3;
  if (
    preferences.indoorPreference !== "either"
    && event.environment === preferences.indoorPreference
  ) score += 2;
  if (
    preferences.budgetMax != null
    && (event.isFree === true
      || (event.costAmount != null && event.costAmount <= preferences.budgetMax))
  ) score += 2;
  if (
    preferences.driveMinutes != null
    && event.driveMinutes != null
    && event.driveMinutes <= preferences.driveMinutes
  ) score += 1;
  return score;
}

export function selectDigestEvents(
  edition: DigestEdition,
  preferences: DigestPreferences | null,
  personalizationEnabled: boolean
): DigestSelection {
  if (!personalizationEnabled || !preferences?.personalizeFriday) {
    return {
      eventIds: edition.genericEventIds,
      personalized: false,
      reason: personalizationEnabled ? "not-enabled" : "generic",
    };
  }

  const ranked = edition.candidateEvents
    .map((event) => ({ event, score: preferenceScore(event, preferences) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || stableEventOrder(left.event, right.event));

  if (ranked.length < MIN_PERSONALIZED_MATCHES) {
    return {
      eventIds: edition.genericEventIds,
      personalized: false,
      reason: "insufficient-matches",
    };
  }

  return {
    eventIds: ranked.slice(0, DIGEST_EVENT_LIMIT).map(({ event }) => event.id),
    personalized: true,
    reason: "personalized",
  };
}
