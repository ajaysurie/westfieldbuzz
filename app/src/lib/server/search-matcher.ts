import type { SearchableEvent } from "@/lib/search/event-retrieval";
import {
  validateNarrative,
  type NarrativeSegment,
} from "./search-narrative";

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
  }
  return { matches, narrative };
}

export async function matchEventsWithModel(input: {
  query: string;
  candidates: SearchableEvent[];
  fetchImpl?: typeof fetch;
  apiKey?: string;
  model?: string;
}): Promise<ModelMatchResult | null> {
  const apiKey = input.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey || input.candidates.length === 0) return null;
  const model = input.model ?? process.env.WESTFIELDBUZZ_LLM_MODEL ?? DEFAULT_MODEL;
  const fetchImpl = input.fetchImpl ?? fetch;
  const candidates = input.candidates.slice(0, MAX_CANDIDATES_IN_PROMPT);

  const prompt = [
    "You are matching local events to a person's request for a guide around Westfield, NJ.",
    `The request: "${input.query.slice(0, 200)}"`,
    "Below are the only real candidate events. Judge fit from each event's own text, not just its category label. Examples: 'live music' includes a band, show, or concert; 'free' includes 'no cover' or 'free admission'; 'for kids' includes storytime and family programs; 'outdoors' includes parks and markets.",
    "Return the events that genuinely fit, best first. An empty matches list is a correct answer when nothing fits.",
    "Rules:",
    "- Only return ids from the list. Never invent an event, time, price, or fact.",
    "- reason is one short clause (under 12 words) grounded in that event's own text.",
    "- Optionally add a one-or-two sentence narrative naming the best picks; cite them with their ids.",
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
