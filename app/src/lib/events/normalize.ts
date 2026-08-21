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
    location: normalizeWhitespace(input.location),
    town: normalizeWhitespace(input.town),
    category: normalizeCategory(input.category),
    sourceUrl: input.sourceUrl.trim(),
  };
}
