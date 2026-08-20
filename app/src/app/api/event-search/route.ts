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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_384;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 24;
const requestBuckets = new Map<string, { count: number; resetAt: number }>();

interface SearchDependencies {
  repository?: EventRepository;
  parser?: IntentParser;
  now?: Date;
  skipRateLimit?: boolean;
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

function clientKey(request: Request): string {
  return (
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for")?.split(",")[0] ??
    "anonymous"
  ).trim();
}

function isRateLimited(request: Request, now: number): boolean {
  const key = clientKey(request);
  const bucket = requestBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (requestBuckets.size > 1_000) requestBuckets.clear();
    requestBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_REQUESTS;
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
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonFailure("request_too_large", "That search request is too large.", 413);
  }
  if (!dependencies.skipRateLimit && isRateLimited(request, startedAt)) {
    return jsonFailure("rate_limited", "Too many searches. Please wait a minute and try again.", 429);
  }

  let bodyText: string;
  try {
    bodyText = await request.text();
  } catch {
    return jsonFailure("invalid_request", "The search request could not be read.", 400);
  }
  if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) {
    return jsonFailure("request_too_large", "That search request is too large.", 413);
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
