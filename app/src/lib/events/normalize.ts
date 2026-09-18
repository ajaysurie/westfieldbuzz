import {
  EVENT_CATEGORIES,
  type EventCategory,
  type EventFacts,
} from "./types";

const CATEGORY_ALIASES: Record<string, EventCategory> = {
  family: "Family & Kids",
  "family & kids": "Family & Kids",
  children: "Family & Kids",
  "children's": "Family & Kids",
  teen: "Family & Kids",
  arts: "Arts & Culture",
  "arts & culture": "Arts & Culture",
  crafts: "Arts & Culture",
  sports: "Sports & Recreation",
  "sports & recreation": "Sports & Recreation",
  recreation: "Sports & Recreation",
  music: "Music",
  food: "Food & Drink",
  "food & drink": "Food & Drink",
  community: "Community",
  adult: "Community",
  technology: "Community",
  "book club": "Community",
  health: "Health & Wellness",
  "health & wellness": "Health & Wellness",
  entertainment: "Entertainment",
  film: "Entertainment",
  history: "History",
  market: "Markets",
  markets: "Markets",
};

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Some feeds prefix the venue with a list marker ("- 1025 Orange Avenue
 * Cranford NJ 07016"). A leading dash or bullet is never a legitimate part of
 * a venue name.
 */
export function normalizeLocation(value: string | undefined | null): string {
  return normalizeWhitespace(value ?? "").replace(/^[-–—•*·]+/, "").trim();
}

/**
 * Feeds that carry no end time sometimes echo the start time, producing
 * zero-duration listings ("8:00 PM–8:00 PM"). A zero or negative duration is a
 * parsing artifact, not a fact — drop it so the event renders with its start
 * time only.
 */
export function normalizeEndDate(date: Date, endDate: Date | null): Date | null {
  if (!endDate || endDate.getTime() <= date.getTime()) return null;
  return endDate;
}

export function normalizeCategory(value: string | undefined | null): EventCategory {
  if (!value) return "Community";
  const exact = EVENT_CATEGORIES.find(
    (category) => category.toLowerCase() === value.trim().toLowerCase()
  );
  if (exact) return exact;
  return CATEGORY_ALIASES[value.trim().toLowerCase()] ?? "Community";
}

export function normalizeEventFacts(input: EventFacts): EventFacts {
  return {
    ...input,
    title: normalizeWhitespace(input.title),
    description: normalizeWhitespace(input.description),
    location: normalizeLocation(input.location),
    town: normalizeWhitespace(input.town),
    category: normalizeCategory(input.category),
    endDate: normalizeEndDate(input.date, input.endDate),
    sourceUrl: input.sourceUrl.trim(),
  };
}
