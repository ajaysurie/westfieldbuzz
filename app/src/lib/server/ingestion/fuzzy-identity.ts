/**
 * Fuzzy cross-source duplicate detection.
 *
 * The exact identity fingerprint (identity.ts) only matches when two sources
 * describe an event with byte-identical normalized facts. In practice the same
 * concert shows up as "LATIN JAZZ @ GALERIA Concert Series: ..." from one feed
 * and "Latin Jazz at Galeria" from another, at the same venue and time. This
 * module scores those near-misses so ingestion can hold them for review instead
 * of publishing a visible duplicate.
 *
 * Policy is deliberately conservative: a fuzzy signal NEVER merges or
 * publishes. It only routes the observation to the candidate review queue with
 * the matched event ids attached. A false positive costs one review click; a
 * false negative costs a duplicate on the homepage.
 */

import { parseSourceDateTime } from "./time";

export const FUZZY_DUPLICATE_TIMEZONE = "America/New_York";
/** Two listings of the same event start within an hour of each other. */
export const FUZZY_MAX_START_DELTA_MINUTES = 60;
/** Fraction of the shorter title's tokens that must appear in the longer. */
export const FUZZY_MIN_TITLE_SCORE = 0.5;
/** Fraction of the shorter venue's tokens that must appear in the longer. */
export const FUZZY_MIN_VENUE_SCORE = 0.6;
/**
 * When the venue is a near-certain match (same street address), less title
 * evidence is enough: "FestiFall by The Chamber of Commerce" and "FestiFall
 * Street Fair" share only the word "FestiFall".
 */
export const FUZZY_STRONG_VENUE_SCORE = 0.9;
export const FUZZY_MIN_TITLE_SCORE_STRONG_VENUE = 0.3;

const STOPWORDS = new Set([
  "a", "an", "the", "at", "in", "on", "of", "for", "to", "with", "and", "or",
  "by", "from", "vs", "de", "la", "el", "&",
]);

/**
 * Canonical short forms for street address words. Both "St" and "Street"
 * collapse to "st" so venue strings from different sources compare equal.
 * Single letters are kept as-is ("Bull N Bear" must not become "Bull north
 * Bear"), which is safe because both sides canonicalize the same way.
 */
const ADDRESS_CANONICAL: Record<string, string> = {
  st: "st",
  street: "st",
  ave: "ave",
  av: "ave",
  avenue: "ave",
  blvd: "blvd",
  boulevard: "blvd",
  rd: "rd",
  road: "rd",
  dr: "dr",
  drive: "dr",
  ln: "ln",
  lane: "ln",
  pl: "pl",
  place: "pl",
  pkwy: "pkwy",
  parkway: "pkwy",
  hwy: "hwy",
  highway: "hwy",
  cir: "cir",
  circle: "cir",
  ct: "ct",
  court: "ct",
  ter: "ter",
  terrace: "ter",
  ste: "ste",
  suite: "ste",
  bldg: "bldg",
  building: "bldg",
  n: "n",
  north: "n",
  s: "s",
  south: "s",
  e: "e",
  east: "e",
  w: "w",
  west: "w",
};

export interface FuzzyDuplicateScore {
  duplicate: boolean;
  /** Mean of title and venue scores, for reporting. */
  score: number;
  titleScore: number;
  venueScore: number;
  startDeltaMinutes: number;
}

function normalizeFuzzyText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘`]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeAddressTokens(tokens: string[]): string[] {
  return tokens.map((token) => ADDRESS_CANONICAL[token] ?? token);
}

function contentTokens(value: string): string[] {
  return canonicalizeAddressTokens(normalizeFuzzyText(value).split(" ")).filter(
    (token) => token.length > 0 && !STOPWORDS.has(token)
  );
}

/**
 * What fraction of the shorter token list appears in the longer one. This is
 * the right shape for duplicate titles because one source usually carries the
 * full billing ("LATIN JAZZ @ GALERIA Concert Series: ...") while another
 * carries the short name ("Latin Jazz at Galeria").
 */
function containmentScore(a: string[], b: string[]): number {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length === 0) return 0;
  const longerSet = new Set(longer);
  const shared = shorter.filter((token) => longerSet.has(token)).length;
  return shared / shorter.length;
}

/**
 * Street number + street name, e.g. "111 quimby st". Two venue strings that
 * share an address core are the same place even when the surrounding prose
 * differs ("GALERIA, 111 Quimby Street in downtown Westfield" vs "Galeria The
 * Art Venue & Framing Galeria West, 111 Quimby St").
 */
function addressCore(tokens: string[]): string | null {
  for (let i = 0; i < tokens.length; i += 1) {
    if (/^\d+$/.test(tokens[i])) {
      const street = tokens
        .slice(i + 1, i + 3)
        .filter((token) => token.length > 0 && !STOPWORDS.has(token));
      if (street.length > 0) return `${tokens[i]} ${street.join(" ")}`;
      return null;
    }
  }
  return null;
}

export function titleSimilarity(a: string, b: string): number {
  return containmentScore(contentTokens(a), contentTokens(b));
}

export function venueSimilarity(a: string, b: string): number {
  const tokensA = contentTokens(a);
  const tokensB = contentTokens(b);
  const coreA = addressCore(tokensA);
  const coreB = addressCore(tokensB);
  if (coreA && coreB && coreA === coreB) return 1;
  return containmentScore(tokensA, tokensB);
}

function localDay(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

/**
 * UTC bounds for the local calendar day containing `date`. Used to scope the
 * Firestore same-day query before scoring candidates in memory. The 24h span
 * is a query window, not a day-length claim across DST transitions; the fuzzy
 * gate re-checks the local day on every candidate.
 */
export function localDayBounds(
  date: Date,
  timeZone: string = FUZZY_DUPLICATE_TIMEZONE
): { start: Date; end: Date } {
  const start = parseSourceDateTime(
    `${localDay(date, timeZone)} 00:00:00`,
    timeZone
  );
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export function scoreFuzzyDuplicate(
  observation: { title: string; location: string; date: Date },
  existing: { title: string; location: string; date: Date }
): FuzzyDuplicateScore {
  const startDeltaMinutes =
    Math.abs(observation.date.getTime() - existing.date.getTime()) / 60_000;
  if (
    localDay(observation.date, FUZZY_DUPLICATE_TIMEZONE) !==
      localDay(existing.date, FUZZY_DUPLICATE_TIMEZONE) ||
    startDeltaMinutes > FUZZY_MAX_START_DELTA_MINUTES
  ) {
    return {
      duplicate: false,
      score: 0,
      titleScore: 0,
      venueScore: 0,
      startDeltaMinutes,
    };
  }
  const titleScore = titleSimilarity(observation.title, existing.title);
  const venueScore = venueSimilarity(observation.location, existing.location);
  const duplicate =
    (titleScore >= FUZZY_MIN_TITLE_SCORE &&
      venueScore >= FUZZY_MIN_VENUE_SCORE) ||
    (venueScore >= FUZZY_STRONG_VENUE_SCORE &&
      titleScore >= FUZZY_MIN_TITLE_SCORE_STRONG_VENUE);
  return {
    duplicate,
    score: duplicate ? (titleScore + venueScore) / 2 : 0,
    titleScore,
    venueScore,
    startDeltaMinutes,
  };
}
