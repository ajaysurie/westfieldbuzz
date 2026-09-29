import type { SearchableEvent } from "@/lib/search/event-retrieval";
import {
  validateNarrative,
  type NarrativeSegment,
} from "./search-narrative";
import { fastThinkingConfig } from "@/lib/server/gemini";

/**
 * Match candidates to a request with the model, not with field filters.
 *
 * Structured event fields are sparse in the corpus — cost, ages, and venue
 * type live in titles and descriptions, so a deterministic filter that
 * requires verified facts returns nothing for most real queries. The model
 * reads the same text a person would and judges fit semantically.
 *
 * Grounding mirrors composeNarrative: the model only sees candidate events
 * and may only return ids from that list, so a wrong answer degrades to a
 * filtered or empty result, never to an invented event. A null return means
 * the matcher itself failed; the caller falls back to deterministic ranking.
 */

const MATCH_TIMEOUT_MS = 12_000;
const DEFAULT_MODEL = "gemini-3.7-flash";
const MAX_CANDIDATES_IN_PROMPT = 60;
const MAX_DESCRIPTION_CHARS = 220;
const MAX_REASON_CHARS = 140;
const MAX_MATCHES = 50;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          eventId: { type: "string" },
          reason: { type: "string" },
        },
        required: ["eventId", "reason"],
      },
    },
    narrative: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          eventId: { type: "string", nullable: true },
        },
        required: ["text"],
      },
    },
  },
  required: ["matches"],
} as const;

export interface EventMatch {
  event: SearchableEvent;
  reason: string;
}

export interface ModelMatchResult {
  matches: EventMatch[];
  narrative: NarrativeSegment[] | null;
}

function candidateLine(event: SearchableEvent): string {
  const when = new Date(event.date).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const cost = event.isFree
    ? "free"
    : event.costAmount != null
      ? `$${event.costAmount}`
      : "cost unknown";
  const description = event.description.slice(0, MAX_DESCRIPTION_CHARS);
  return `id=${event.id} | ${event.title} | ${when} | ${event.location}, ${event.town} | ${event.category} | ${cost} | ${description}`;
}

/**
 * A citation should link the event's name, not the whole sentence around it.
 * When the model links a segment much longer than the title, keep the words
 * and drop the link.
 */
function linkOnlyNames(segment: NarrativeSegment, byId: Map<string, SearchableEvent>): NarrativeSegment {
  if (!segment.eventId) return segment;
  const title = byId.get(segment.eventId)?.title ?? "";
  return segment.text.length > title.length + 25 ? { text: segment.text } : segment;
}

function parseMatchPayload(
  payload: unknown,
  candidates: SearchableEvent[]
): ModelMatchResult | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as { matches?: unknown; narrative?: unknown };
  if (!Array.isArray(record.matches)) return null;

  const byId = new Map(candidates.map((event) => [event.id, event]));
  const seen = new Set<string>();
  const matches: EventMatch[] = [];
  for (const raw of record.matches) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as { eventId?: unknown; reason?: unknown };
    if (typeof item.eventId !== "string" || typeof item.reason !== "string") return null;
    const event = byId.get(item.eventId);
    if (!event || seen.has(item.eventId)) return null;
    seen.add(item.eventId);
    matches.push({ event, reason: item.reason.slice(0, MAX_REASON_CHARS) });
    if (matches.length >= MAX_MATCHES) break;
  }

  let narrative: NarrativeSegment[] | null = null;
  if (record.narrative != null) {
    narrative = validateNarrative({ segments: record.narrative }, candidates.map((event) => ({
      event,
      rank: 0,
      label: "",
      reason: "",
    })));
    narrative = narrative?.map((segment) => linkOnlyNames(segment, byId)) ?? null;
  }
  return { matches, narrative };
}

/**
 * The prompt holds MAX_CANDIDATES_IN_PROMPT events. Taking the first N by date
 * would drop every later match on an undated query ("Halloween events" over a
 * 90-day window), so candidates are ranked into tiers, earliest first within
 * each: keyword and category, keyword only, category only, then the rest. A
 * keyword is the specific topic, so it outranks a broad category. Keywords are
 * matched only against text the prompt shows the model (title and the
 * truncated description), so a slot never goes to an event whose match the
 * model cannot see. Returned in date order.
 */
export function selectPromptCandidates(
  candidates: SearchableEvent[],
  hints: { keywords: string[]; categories: string[] },
  max = MAX_CANDIDATES_IN_PROMPT
): SearchableEvent[] {
  if (candidates.length <= max) return candidates;
  const words = hints.keywords.map((word) => word.trim().toLowerCase()).filter((word) => word.length > 1);
  const tier = (event: SearchableEvent) => {
    const visible = `${event.title} ${event.description.slice(0, MAX_DESCRIPTION_CHARS)}`.toLowerCase();
    const keyword = words.some((word) => visible.includes(word)) ? 2 : 0;
    const category = hints.categories.includes(event.category) ? 1 : 0;
    return keyword + category;
  };
  const ranked = candidates
    .map((event, index) => ({ event, index, tier: tier(event) }))
    .sort((a, b) => b.tier - a.tier || a.index - b.index);
  const chosen = new Set(ranked.slice(0, max).map(({ event }) => event));
  return candidates.filter((event) => chosen.has(event));
}

export async function matchEventsWithModel(input: {
  query: string;
  candidates: SearchableEvent[];
  /** Parsed intent terms used to choose which candidates fit in the prompt. */
  hints?: { keywords: string[]; categories: string[] };
  fetchImpl?: typeof fetch;
  apiKey?: string;
  model?: string;
}): Promise<ModelMatchResult | null> {
  const apiKey = input.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey || input.candidates.length === 0) return null;
  const model = input.model ?? process.env.WESTFIELDBUZZ_LLM_MODEL ?? DEFAULT_MODEL;
  const fetchImpl = input.fetchImpl ?? fetch;
  const candidates = selectPromptCandidates(input.candidates, input.hints ?? { keywords: [], categories: [] });

  const prompt = [
    "You are matching local events to a person's request for a guide around Westfield, NJ.",
    `The request: "${input.query.slice(0, 200)}"`,
    "Below are the only real candidate events. Judge fit from each event's own text, not just its category label. Examples: 'live music' includes a band, show, or concert; 'free' includes 'no cover' or 'free admission'; 'for kids' includes storytime and family programs; 'outdoors' includes parks and markets.",
    "Return the events that genuinely fit, best first. An empty matches list is a correct answer when nothing fits.",
    "Rules:",
    "- Only return ids from the list. Never invent an event, time, price, or fact.",
    "- reason is one short clause (under 12 words) grounded in that event's own text.",
    "- Optionally add a one-or-two sentence narrative naming the best picks. Split it into segments: each event's name is its own segment carrying that eventId, and all other words go in segments without an eventId.",
    "",
    "CANDIDATES:",
    ...candidates.map(candidateLine),
  ].join("\n");

  try {
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
            ...fastThinkingConfig(model),
          },
        }),
        signal: AbortSignal.timeout(MATCH_TIMEOUT_MS),
      }
    );
    if (!response.ok) return null;
    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return null;
    return parseMatchPayload(JSON.parse(raw), candidates);
  } catch {
    return null;
  }
}
