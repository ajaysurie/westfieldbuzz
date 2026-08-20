import {
  EVENT_CATEGORIES,
  type EventCategory,
} from "@/lib/events/types";

export const SEARCH_TIME_ZONE = "America/New_York";
export const SEARCH_INTENT_VERSION = 1 as const;
export const MAX_SEARCH_QUERY_LENGTH = 400;

export const TIME_OF_DAY = ["morning", "afternoon", "evening"] as const;
export type TimeOfDay = (typeof TIME_OF_DAY)[number];

export interface SearchAmbiguity {
  field: "date" | "town" | "age" | "other";
  message: string;
  options: string[];
}

export interface SearchIntent {
  version: typeof SEARCH_INTENT_VERSION;
  timeZone: typeof SEARCH_TIME_ZONE;
  dateWindow: { startDate: string; endDate: string } | null;
  partyAges: number[];
  towns: string[];
  maxDriveMinutes: number | null;
  categories: EventCategory[];
  timeOfDay: TimeOfDay[];
  budget: { freeOnly: boolean; maxAmount: number | null } | null;
  environment: "indoor" | "outdoor" | null;
  registration: "required" | "drop-in" | null;
  availability: Array<"available" | "registration-required" | "waitlist">;
  accessibility: string[];
  keywords: string[];
  exclusions: {
    categories: EventCategory[];
    keywords: string[];
  };
  ambiguities: SearchAmbiguity[];
}

export interface ParsedIntent {
  intent: SearchIntent;
  fallbackUsed: boolean;
  parserWarning?: "model-unavailable" | "model-timeout" | "model-invalid";
}

export function emptySearchIntent(): SearchIntent {
  return {
    version: SEARCH_INTENT_VERSION,
    timeZone: SEARCH_TIME_ZONE,
    dateWindow: null,
    partyAges: [],
    towns: [],
    maxDriveMinutes: null,
    categories: [],
    timeOfDay: [],
    budget: null,
    environment: null,
    registration: null,
    availability: [],
    accessibility: [],
    keywords: [],
    exclusions: { categories: [], keywords: [] },
    ambiguities: [],
  };
}

export function sanitizeSearchQuery(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueStrings(value: unknown, max = 12): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return null;
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))].slice(
    0,
    max
  );
}

function enumArray<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T[] | null {
  const strings = uniqueStrings(value);
  if (!strings || strings.some((item) => !allowed.includes(item as T))) {
    return null;
  }
  return strings as T[];
}

function isLocalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
}

export function validateSearchIntent(value: unknown): SearchIntent | null {
  if (!isPlainObject(value)) return null;
  if (value.version !== SEARCH_INTENT_VERSION || value.timeZone !== SEARCH_TIME_ZONE) {
    return null;
  }

  let dateWindow: SearchIntent["dateWindow"] = null;
  if (value.dateWindow !== null) {
    if (
      !isPlainObject(value.dateWindow) ||
      !isLocalDate(value.dateWindow.startDate) ||
      !isLocalDate(value.dateWindow.endDate) ||
      value.dateWindow.endDate < value.dateWindow.startDate
    ) {
      return null;
    }
    dateWindow = {
      startDate: value.dateWindow.startDate,
      endDate: value.dateWindow.endDate,
    };
  }

  if (
    !Array.isArray(value.partyAges) ||
    value.partyAges.some(
      (age) => !Number.isInteger(age) || (age as number) < 0 || (age as number) > 120
    )
  ) {
    return null;
  }
  const towns = uniqueStrings(value.towns, 6);
  const categories = enumArray(value.categories, EVENT_CATEGORIES);
  const timeOfDay = enumArray(value.timeOfDay, TIME_OF_DAY);
  const availability = enumArray(value.availability, [
    "available",
    "registration-required",
    "waitlist",
  ] as const);
  const accessibility = uniqueStrings(value.accessibility, 8);
  const keywords = uniqueStrings(value.keywords, 12);
  if (
    !towns ||
    !categories ||
    !timeOfDay ||
    !availability ||
    !accessibility ||
    !keywords
  ) {
    return null;
  }

  const maxDriveMinutes = value.maxDriveMinutes;
  if (
    maxDriveMinutes !== null &&
    (!Number.isInteger(maxDriveMinutes) ||
      (maxDriveMinutes as number) < 1 ||
      (maxDriveMinutes as number) > 180)
  ) {
    return null;
  }

  let budget: SearchIntent["budget"] = null;
  if (value.budget !== null) {
    if (
      !isPlainObject(value.budget) ||
      typeof value.budget.freeOnly !== "boolean" ||
      (value.budget.maxAmount !== null &&
        (typeof value.budget.maxAmount !== "number" ||
          !Number.isFinite(value.budget.maxAmount) ||
          value.budget.maxAmount < 0 ||
          value.budget.maxAmount > 10_000))
    ) {
      return null;
    }
    budget = {
      freeOnly: value.budget.freeOnly,
      maxAmount: value.budget.maxAmount,
    };
  }

  if (
    value.environment !== null &&
    value.environment !== "indoor" &&
    value.environment !== "outdoor"
  ) {
    return null;
  }
  if (
    value.registration !== null &&
    value.registration !== "required" &&
    value.registration !== "drop-in"
  ) {
    return null;
  }
  if (!isPlainObject(value.exclusions)) return null;
  const excludedCategories = enumArray(
    value.exclusions.categories,
    EVENT_CATEGORIES
  );
  const excludedKeywords = uniqueStrings(value.exclusions.keywords, 12);
  if (!excludedCategories || !excludedKeywords) return null;

  if (!Array.isArray(value.ambiguities) || value.ambiguities.length > 8) {
    return null;
  }
  const ambiguities: SearchAmbiguity[] = [];
  for (const ambiguity of value.ambiguities) {
    if (
      !isPlainObject(ambiguity) ||
      !["date", "town", "age", "other"].includes(String(ambiguity.field)) ||
      typeof ambiguity.message !== "string" ||
      ambiguity.message.length > 180
    ) {
      return null;
    }
    const options = uniqueStrings(ambiguity.options, 6);
    if (!options) return null;
    ambiguities.push({
      field: ambiguity.field as SearchAmbiguity["field"],
      message: ambiguity.message,
      options,
    });
  }

  return {
    version: SEARCH_INTENT_VERSION,
    timeZone: SEARCH_TIME_ZONE,
    dateWindow,
    partyAges: [...new Set(value.partyAges as number[])].slice(0, 8),
    towns,
    maxDriveMinutes: maxDriveMinutes as number | null,
    categories,
    timeOfDay,
    budget,
    environment: value.environment as SearchIntent["environment"],
    registration: value.registration as SearchIntent["registration"],
    availability,
    accessibility,
    keywords,
    exclusions: {
      categories: excludedCategories,
      keywords: excludedKeywords,
    },
    ambiguities,
  };
}

function localDateParts(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SEARCH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

export function localDateString(now: Date): string {
  const { year, month, day } = localDateParts(now);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addLocalDays(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return date.toISOString().slice(0, 10);
}

function nextWeekday(now: Date, weekday: number): string {
  const today = localDateString(now);
  const [year, month, day] = today.split("-").map(Number);
  const current = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  const delta = (weekday - current + 7) % 7;
  return addLocalDays(today, delta);
}

const CATEGORY_TERMS: Array<[EventCategory, RegExp]> = [
  ["Sports & Recreation", /\b(sports?|soccer|baseball|basketball|active|fitness)\b/i],
  ["Family & Kids", /\b(kids?|children|child|family|toddler|teen|story\s*time)\b/i],
  ["Arts & Culture", /\b(arts?|crafts?|museum|paint|clay|culture)\b/i],
  ["Music", /\b(music|concert|band|jazz|singer|orchestra)\b/i],
  ["Food & Drink", /\b(food|dinner|lunch|brunch|tasting|cooking)\b/i],
  ["Health & Wellness", /\b(health|wellness|yoga|meditation)\b/i],
  ["Entertainment", /\b(movie|film|theat(?:er|re)|show|comedy)\b/i],
  ["History", /\b(history|historical|heritage)\b/i],
  ["Markets", /\b(markets?|vendors?|craft fair|farmers? market)\b/i],
  ["Community", /\b(community|volunteer|civic)\b/i],
];

const STOP_WORDS = new Set([
  "a", "actually", "after", "all", "an", "and", "any", "at", "be", "before",
  "do", "event", "events", "find", "for", "from", "i", "in", "is", "it", "me",
  "my", "near", "of", "on", "or", "please", "something", "that", "the", "this",
  "to", "under", "want", "with", "within", "year", "years", "old",
  // These are represented structurally above, never as literal event text.
  "indoor", "indoors", "outdoor", "outdoors", "inside", "outside", "morning",
  "afternoon", "evening", "tonight", "free", "registration", "required",
  "minute", "minutes", "not", "westfield", "cranford", "scotch", "plains", "fanwood",
  "summit", "garwood", "mountainside",
]);

function extractKeywords(query: string): string[] {
  return [...new Set(
    query
      .toLowerCase()
      .replace(/[^a-z0-9'-]+/g, " ")
      .split(" ")
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word) && !/^\d+(?:-?year-old|yo)?$/.test(word))
  )].slice(0, 10);
}

function mergeUnique<T>(current: T[], additions: T[]): T[] {
  return [...new Set([...current, ...additions])];
}

export function fallbackParseIntent(input: {
  query: string;
  priorIntent?: SearchIntent | null;
  now?: Date;
}): SearchIntent {
  const query = sanitizeSearchQuery(input.query);
  const lower = query.toLowerCase();
  const now = input.now ?? new Date();
  const intent = structuredClone(input.priorIntent ?? emptySearchIntent());
  intent.ambiguities = [];

  const weekdays: Array<[string, number]> = [
    ["sunday", 0], ["monday", 1], ["tuesday", 2], ["wednesday", 3],
    ["thursday", 4], ["friday", 5], ["saturday", 6],
  ];
  const foundDays = weekdays.filter(([name]) => new RegExp(`\\b${name}\\b`, "i").test(query));
  if (foundDays.length === 1) {
    const date = nextWeekday(now, foundDays[0][1]);
    intent.dateWindow = { startDate: date, endDate: date };
  } else if (foundDays.length > 1 && !/\bthrough|\bto\b|weekend/.test(lower)) {
    intent.dateWindow = null;
    intent.ambiguities.push({
      field: "date",
      message: "Which day should the search use?",
      options: foundDays.map(([name]) => name[0].toUpperCase() + name.slice(1)),
    });
  } else if (/\b(today|tonight)\b/.test(lower)) {
    const date = localDateString(now);
    intent.dateWindow = { startDate: date, endDate: date };
  } else if (/\btomorrow\b/.test(lower)) {
    const date = addLocalDays(localDateString(now), 1);
    intent.dateWindow = { startDate: date, endDate: date };
  } else if (/\bweekend\b/.test(lower)) {
    const saturday = nextWeekday(now, 6);
    intent.dateWindow = { startDate: saturday, endDate: addLocalDays(saturday, 1) };
  } else if (/\b(any day|whenever)\b/.test(lower)) {
    intent.dateWindow = null;
  } else if (/\b(sometime|one day|a day)\b/.test(lower)) {
    intent.ambiguities.push({
      field: "date",
      message: "What date or day of the week works for you?",
      options: ["Today", "This weekend", "Any day"],
    });
  }

  const ages = [...lower.matchAll(/\b(\d{1,3})(?:\s*[- ]?year[- ]old|\s*yo\b)/g)]
    .map((match) => Number(match[1]))
    .filter((age) => age >= 0 && age <= 120);
  if (ages.length) intent.partyAges = [...new Set(ages)];
  if (/\b(any age|all ages)\b/.test(lower)) intent.partyAges = [];

  const drive = lower.match(/\bwithin\s+(\d{1,3})\s*(?:minutes?|mins?)\b/);
  if (drive) intent.maxDriveMinutes = Math.min(180, Math.max(1, Number(drive[1])));
  if (/\b(anywhere|any distance)\b/.test(lower)) intent.maxDriveMinutes = null;

  if (/\bindoors?|inside\b/.test(lower)) intent.environment = "indoor";
  if (/\boutdoors?|outside\b/.test(lower)) intent.environment = "outdoor";
  if (/\b(either indoor|indoors? or outdoors?|any setting)\b/.test(lower)) {
    intent.environment = null;
  }

  if (/\bmorning\b/.test(lower)) intent.timeOfDay = ["morning"];
  if (/\bafternoon\b/.test(lower)) intent.timeOfDay = ["afternoon"];
  if (/\b(evening|tonight|night)\b/.test(lower)) intent.timeOfDay = ["evening"];
  if (/\b(any time|whenever)\b/.test(lower)) intent.timeOfDay = [];

  const maxBudget = lower.match(/\b(?:under|less than|up to|max(?:imum)?)\s*\$\s?(\d+(?:\.\d{1,2})?)/);
  if (/\bfree\b/.test(lower)) intent.budget = { freeOnly: true, maxAmount: 0 };
  else if (maxBudget) intent.budget = { freeOnly: false, maxAmount: Number(maxBudget[1]) };
  else if (/\b(any budget|price doesn't matter)\b/.test(lower)) intent.budget = null;

  if (/\b(no|without|doesn't need|does not need)\s+(?:advance\s+)?registration\b|\bdrop[- ]?in\b/.test(lower)) {
    intent.registration = "drop-in";
  } else if (/\bregistration required|needs? registration\b/.test(lower)) {
    intent.registration = "required";
  }

  const excludedCategories: EventCategory[] = [];
  const positiveCategories: EventCategory[] = [];
  for (const [category, pattern] of CATEGORY_TERMS) {
    const match = lower.match(pattern);
    if (!match) continue;
    const prefix = lower.slice(Math.max(0, (match.index ?? 0) - 16), match.index);
    if (/\b(no|not|without|exclude|anything but)\s*$/.test(prefix)) {
      excludedCategories.push(category);
    } else {
      positiveCategories.push(category);
    }
  }
  const isExplicitCorrection = /\b(actually|instead|rather than|change(?: it)? to|switch to|forget)\b/.test(lower);
  if (isExplicitCorrection && (positiveCategories.length || excludedCategories.length)) {
    // Refinements like “actually music, not sports” replace a prior category
    // constraint. Ordinary additive phrasing continues to merge below.
    intent.categories = [];
    intent.exclusions.categories = [];
  }
  if (positiveCategories.length) {
    intent.categories = mergeUnique(intent.categories, positiveCategories).filter(
      (category) => !excludedCategories.includes(category)
    );
  }
  if (excludedCategories.length) {
    intent.exclusions.categories = mergeUnique(
      intent.exclusions.categories,
      excludedCategories
    );
    intent.categories = intent.categories.filter(
      (category) => !excludedCategories.includes(category)
    );
  }
  // A direct positive correction wins over a contradictory older exclusion,
  // and a direct negative correction wins over an older inclusion.
  if (positiveCategories.length) {
    intent.exclusions.categories = intent.exclusions.categories.filter(
      (category) => !positiveCategories.includes(category)
    );
  }

  const knownTowns = ["Westfield", "Cranford", "Scotch Plains", "Fanwood", "Summit", "Garwood", "Mountainside"];
  const foundTowns = knownTowns.filter((town) =>
    new RegExp(`\\b${town.replace(" ", "\\s+")}\\b`, "i").test(query)
  );
  if (foundTowns.length) intent.towns = foundTowns;
  if (/\bspringfield\b/.test(lower)) {
    intent.ambiguities.push({
      field: "town",
      message: "Which Springfield do you mean?",
      options: ["Springfield, Union County", "Springfield Township, Burlington County"],
    });
  }

  if (/\b(wheelchair|step[- ]free|accessible)\b/.test(lower)) {
    intent.accessibility = mergeUnique(intent.accessibility, ["wheelchair-accessible"]);
  }

  const categoryWords = new Set(CATEGORY_TERMS.flatMap(([category]) => category.toLowerCase().split(/\W+/)));
  const extractedKeywords = extractKeywords(query).filter(
    (word) => !categoryWords.has(word) && !weekdays.some(([day]) => day === word)
  );
  intent.keywords = isExplicitCorrection ? extractedKeywords : mergeUnique(intent.keywords, extractedKeywords);
  return intent;
}

export function intentChips(intent: SearchIntent): Array<{ field: string; label: string }> {
  const chips: Array<{ field: string; label: string }> = [];
  if (intent.dateWindow) {
    const label = intent.dateWindow.startDate === intent.dateWindow.endDate
      ? intent.dateWindow.startDate
      : `${intent.dateWindow.startDate} – ${intent.dateWindow.endDate}`;
    chips.push({ field: "dateWindow", label });
  }
  for (const age of intent.partyAges) chips.push({ field: "partyAges", label: `Age ${age}` });
  for (const town of intent.towns) chips.push({ field: "towns", label: town });
  if (intent.maxDriveMinutes) chips.push({ field: "maxDriveMinutes", label: `Within ${intent.maxDriveMinutes} min` });
  for (const category of intent.categories) chips.push({ field: "categories", label: category });
  for (const part of intent.timeOfDay) chips.push({ field: "timeOfDay", label: part[0].toUpperCase() + part.slice(1) });
  if (intent.budget?.freeOnly) chips.push({ field: "budget", label: "Free" });
  else if (intent.budget?.maxAmount != null) chips.push({ field: "budget", label: `Under $${intent.budget.maxAmount}` });
  if (intent.environment) chips.push({ field: "environment", label: intent.environment === "indoor" ? "Indoors" : "Outdoors" });
  if (intent.registration) chips.push({ field: "registration", label: intent.registration === "drop-in" ? "No advance registration" : "Registration required" });
  for (const category of intent.exclusions.categories) chips.push({ field: "exclusions", label: `Not ${category}` });
  return chips;
}
