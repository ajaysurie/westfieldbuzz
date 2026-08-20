import { NextResponse } from "next/server";
import {
  MAX_SEARCH_QUERY_LENGTH,
  sanitizeSearchQuery,
  validateSearchIntent,
  type SearchIntent,
} from "@/lib/search/event-intent";
import {
  filterEvents,
  queryWindowForIntent,
  type EventRepository,
} from "@/lib/search/event-retrieval";
import { rankEvents } from "@/lib/search/event-ranking";
import { explainMatch, resultLabel } from "@/lib/search/event-explanations";
import type {
  EventSearchFailure,
  EventSearchResponse,
  EventSearchSuccess,
} from "@/lib/search/search-contract";
import {
  parseIntentResilient,
  type IntentParser,
} from "@/lib/server/openai/event-intent-parser";
import { createFirestoreEventRepository } from "@/lib/server/event-query/firestore-event-repository";
import { allowEventSearch } from "@/lib/server/search-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_384;

interface SearchDependencies {
  repository?: EventRepository;
  parser?: IntentParser;
  now?: Date;
  skipRateLimit?: boolean;
  rateLimiter?: (request: Request, now: Date) => Promise<boolean>;
}

function jsonFailure(
  code: EventSearchFailure["error"]["code"],
  message: string,
  status: number,
  extra: Pick<EventSearchFailure, "intent" | "fallbackUsed"> = {}
) {
  return NextResponse.json<EventSearchFailure>(
    { ok: false, error: { code, message }, ...extra },
    { status }
  );
}

async function readBoundedBody(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function noMatchSuggestions(intent: SearchIntent): string[] {
  const suggestions: string[] = [];
  if (intent.maxDriveMinutes != null) suggestions.push("Try a wider drive time");
  if (intent.budget) suggestions.push("Remove the budget limit");
  if (intent.environment) suggestions.push("Include indoor and outdoor events");
  if (intent.partyAges.length) suggestions.push("Browse events without a listed age range");
  if (intent.dateWindow) suggestions.push("Check nearby dates in the calendar");
  if (!suggestions.length) suggestions.push("Browse the full event calendar");
  return suggestions.slice(0, 3);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function handleEventSearch(
  request: Request,
  dependencies: SearchDependencies = {}
): Promise<NextResponse<EventSearchResponse>> {
  const startedAt = Date.now();
  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader == null ? 0 : Number(contentLengthHeader);
  if (!Number.isFinite(contentLength) || contentLength > MAX_BODY_BYTES) {
    return jsonFailure("request_too_large", "That search request is too large.", 413);
  }
  if (!dependencies.skipRateLimit) {
    try {
      const allowed = await (dependencies.rateLimiter ?? allowEventSearch)(
        request,
        dependencies.now ?? new Date()
      );
      if (!allowed) {
        return jsonFailure("rate_limited", "Too many searches. Please wait and try again.", 429);
      }
    } catch {
      return jsonFailure(
        "inventory_unavailable",
        "Search is temporarily unavailable. Browse the calendar or try again shortly.",
        503
      );
    }
  }

  let bodyText: string;
  try {
    const boundedBody = await readBoundedBody(request);
    if (boundedBody == null) {
      return jsonFailure("request_too_large", "That search request is too large.", 413);
    }
    bodyText = boundedBody;
  } catch {
    return jsonFailure("invalid_request", "The search request could not be read.", 400);
  }
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return jsonFailure("invalid_request", "Send a valid JSON search request.", 400);
  }
  if (!isObject(body) || typeof body.query !== "string") {
    return jsonFailure("invalid_request", "A search sentence is required.", 400);
  }
  if (body.query.length > MAX_SEARCH_QUERY_LENGTH) {
    return jsonFailure(
      "invalid_request",
      `Keep the search under ${MAX_SEARCH_QUERY_LENGTH} characters.`,
      400
    );
  }
  const query = sanitizeSearchQuery(body.query);
  if (!query) return jsonFailure("invalid_request", "A search sentence is required.", 400);

  let priorIntent: SearchIntent | null = null;
  if (body.intent != null) {
    priorIntent = validateSearchIntent(body.intent);
    if (!priorIntent) {
      return jsonFailure("invalid_request", "The previous search state is not valid.", 400);
    }
  }

  const now = dependencies.now ?? new Date();
  const parsed = await parseIntentResilient({
    query,
    priorIntent,
    now,
    parser: dependencies.parser,
  });
  const repository = dependencies.repository ?? createFirestoreEventRepository();
  let events;
  try {
    events = await repository.listPublishedEvents(queryWindowForIntent(parsed.intent, now));
  } catch {
    return jsonFailure(
      "inventory_unavailable",
      "Event inventory is temporarily unavailable. Browse the calendar or try again shortly.",
      503,
      { intent: parsed.intent, fallbackUsed: parsed.fallbackUsed }
    );
  }

  const eligible = filterEvents(events, parsed.intent);
  const ranked = rankEvents(eligible, parsed.intent, now);
  const response: EventSearchSuccess = {
    ok: true,
    query,
    intent: parsed.intent,
    results: ranked.slice(0, 50).map((item, index) => ({
      event: item.event,
      rank: index + 1,
      label: resultLabel(index),
      reason: explainMatch(item, parsed.intent),
    })),
    fallbackUsed: parsed.fallbackUsed,
    ...(parsed.parserWarning ? { parserWarning: parsed.parserWarning } : {}),
    ambiguities: parsed.intent.ambiguities,
    suggestions: ranked.length ? [] : noMatchSuggestions(parsed.intent),
    meta: {
      candidateCount: events.length,
      matchedCount: ranked.length,
      durationMs: Date.now() - startedAt,
    },
  };
  return NextResponse.json(response, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  return handleEventSearch(request);
}
