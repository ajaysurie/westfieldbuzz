/**
 * Read-time cleanup for text scraped from source calendars. Applied where
 * Firestore documents become events, so existing records render cleanly and
 * ingestion identity (built from the raw title and venue) is untouched.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1]?.toLowerCase() === "x"
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

const ONLY_URLS = /^(?:https?:\/\/\S+\s*)+$/i;

export function cleanDescription(value: string | null | undefined): string {
  if (!value) return "";
  const text = decodeEntities(
    value
      // Some feeds double-escape newlines, leaving a literal backslash-n.
      .replace(/\\[nrt]/g, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/?[a-z][^>]*>/gi, " "),
  )
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ONLY_URLS.test(text) ? "" : text;
}

export function cleanLocation(value: string | null | undefined): string {
  if (!value) return "";
  return decodeEntities(value)
    .replace(/^[\s\-–—•·,;:|]+/, "")
    .replace(/[\s\-–—,;:|]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The town suffix to show after a venue, or "" when the venue already names it. */
export function townSuffix(location: string, town: string | null | undefined): string {
  const trimmedTown = town?.trim() ?? "";
  if (!trimmedTown) return "";
  const pattern = new RegExp(`\\b${trimmedTown.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return pattern.test(location) ? "" : trimmedTown;
}

const KEEP_UPPER = new Set([
  "NJ", "NY", "USA", "YMCA", "YWCA", "UCPAC", "UCNJ", "DJ", "TV", "AM", "PM",
  "II", "III", "IV", "LGBTQ", "LGBTQ+", "STEM", "STEAM", "ESL", "CPR", "PTA", "PTO", "BYOB",
]);
const KEEP_LOWER = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "nor", "of", "on", "or", "the", "to", "vs", "w/", "with",
]);

function titleCaseWord(word: string, first: boolean): string {
  const bare = word.replace(/[^A-Za-z+]/g, "");
  if (KEEP_UPPER.has(bare.toUpperCase())) return word.toUpperCase();
  const lower = word.toLowerCase();
  if (!first && KEEP_LOWER.has(lower)) return lower;
  // Capitalize the first letter of each alphabetic run after punctuation that
  // starts a new word ("...i'm" stays "...I'm", "rock-n-roll" → "Rock-N-Roll").
  return lower.replace(/(^|[^a-z'’])([a-z])/g, (_m, before: string, letter: string) => before + letter.toUpperCase());
}

/** Convert shouted ALL-CAPS titles to title case; leave mixed-case titles alone. */
export function cleanTitle(value: string | null | undefined): string {
  if (!value) return "";
  const title = decodeEntities(value).replace(/\s+/g, " ").trim();
  const letters = title.replace(/[^A-Za-z]/g, "");
  const upper = letters.replace(/[^A-Z]/g, "").length;
  if (letters.length < 8 || upper / letters.length < 0.8) return title;
  const words = title.split(" ");
  // A word after a dash or colon starts a subtitle, so it is capitalized too.
  return words
    .map((word, index) => titleCaseWord(word, index === 0 || /^[-\u2013\u2014]$|:$/.test(words[index - 1]!)))
    .join(" ");
}

/** "6:00 PM–8:00 PM", or just "6:00 PM" when the end is missing or equal. */
export function formatTimeRange(start: string, end: string): string {
  if (!start) return "";
  return end && end !== start ? `${start}–${end}` : start;
}
