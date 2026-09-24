import { NextResponse } from "next/server";
import { EVENT_CATEGORIES } from "@/lib/events/types";
import { getAdminDb } from "@/lib/server/firebase-admin";
import { authorizeAgentIngest } from "@/lib/server/ingestion/agent-auth";
import { reconcileSource } from "@/lib/server/ingestion/firestore-repository";
import { checkLocation } from "@/lib/server/ingestion/location-guard";
import { parseSourceDateTime } from "@/lib/server/ingestion/time";
import type {
  EventSourcePolicy,
  SourceObservation,
} from "@/lib/server/ingestion/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_ID = "muse-agent-instagram";
const TIMEZONE = "America/New_York";
const MAX_EVENTS_PER_REQUEST = 100;
const MAX_PAST_DAYS = 14;
const MAX_FUTURE_DAYS = 366;
const MAX_EVENT_HOURS = 72;

const AGENT_SOURCE: EventSourcePolicy = {
  id: SOURCE_ID,
  name: "Muse agent Instagram push",
  type: "agent-push",
  url: "https://www.instagram.com",
  town: "Westfield",
  timezone: TIMEZONE,
  autoApprove: true,
  missingGraceRuns: 3,
  group: "nearby-venues",
  allowedHosts: ["instagram.com"],
  expectedContentTypes: [],
  timeoutMs: 0,
  maxResponseBytes: 0,
  freshnessThresholdHours: 168,
};

interface DroppedEvent {
  index: number;
  title: string;
  reason: string;
}

function stringField(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

function instagramShortcode(postUrl: string): string | null {
  const match = /^https:\/\/(www\.)?instagram\.com\/(p|reel|reels)\/([A-Za-z0-9_-]+)\/?/.exec(
    postUrl
  );
  return match ? match[3] : null;
}

/**
 * Validate one pushed event. Returns either a pipeline-ready observation or a
 * human-readable drop reason. The endpoint never invents facts: anything
 * ambiguous or malformed is dropped and reported, never defaulted into the
 * calendar.
 */
function validateEvent(
  raw: unknown,
  now: Date
): { observation: SourceObservation } | { drop: string; title: string } {
  if (typeof raw !== "object" || raw === null) {
    return { drop: "event is not an object", title: "" };
  }
  const event = raw as Record<string, unknown>;
  const rawTitle = stringField(event.title, 200);
  const title = rawTitle ?? "";
  const drop = (reason: string) => ({ drop: reason, title });

  const handle = stringField(event.instagram_handle, 50);
  if (!handle || !/^[a-z0-9._]+$/i.test(handle)) {
    return drop("instagram_handle is missing or malformed");
  }
  const postUrl = stringField(event.post_url, 500);
  const shortcode = postUrl ? instagramShortcode(postUrl) : null;
  if (!postUrl || !shortcode) {
    return drop("post_url is not an Instagram post/reel URL");
  }
  if (!rawTitle) return drop("title is missing or empty");

  const date = parseSourceDateTime(event.date, TIMEZONE);
  if (Number.isNaN(date.getTime())) return drop("date is not a parseable date-time");
  if (date.getTime() < now.getTime() - MAX_PAST_DAYS * 86_400_000) {
    return drop("date is more than 14 days in the past");
  }
  if (date.getTime() > now.getTime() + MAX_FUTURE_DAYS * 86_400_000) {
    return drop("date is more than a year in the future");
  }

  let endDate: Date | null = null;
  if (event.endDate !== undefined && event.endDate !== null && event.endDate !== "") {
    endDate = parseSourceDateTime(event.endDate, TIMEZONE);
    if (Number.isNaN(endDate.getTime())) return drop("endDate is not a parseable date-time");
    if (endDate.getTime() < date.getTime()) return drop("endDate is before date");
    if (endDate.getTime() - date.getTime() > MAX_EVENT_HOURS * 3_600_000) {
      return drop("event is longer than 72 hours");
    }
  }

  const location = stringField(event.location, 200);
  if (!location) return drop("location is missing or empty");
  const town = stringField(event.town, 100);
  if (!town) return drop("town is missing or empty");

  let category = "Community";
  if (event.category !== undefined && event.category !== null && event.category !== "") {
    if (typeof event.category !== "string" || !(EVENT_CATEGORIES as readonly string[]).includes(event.category)) {
      return drop(`category "${String(event.category)}" is not a known category`);
    }
    category = event.category;
  }

  const description = typeof event.description === "string" ? event.description.trim().slice(0, 4000) : "";

  // Mirror the cron runner: location first, town as the fallback, drop only
  // when the place positively resolves outside the community radius.
  let verdict = checkLocation({ location });
  if (verdict.status === "unknown") verdict = checkLocation({ location: town });
  if (verdict.status === "too-far") {
    return drop(`out of area: ${verdict.place} is ${verdict.miles.toFixed(1)} mi away`);
  }

  const dateKey = date.toISOString().slice(0, 10);
  const observation: SourceObservation = {
    title,
    description,
    date,
    endDate,
    location,
    town,
    category: category as SourceObservation["category"],
    status: "scheduled",
    availability: "unknown",
    sourceId: SOURCE_ID,
    sourceEventId: `ig:${handle.toLowerCase()}:${shortcode}#${dateKey}`,
    sourceUrl: postUrl,
  };
  return { observation };
}

export async function POST(request: Request) {
  const auth = authorizeAgentIngest(request);
  if (auth === "not-configured") {
    return NextResponse.json(
      { ok: false, error: "agent ingest is not configured" },
      { status: 503 }
    );
  }
  if (auth === "unauthorized") {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "request body is not valid JSON" },
      { status: 400 }
    );
  }
  const events = (body as { events?: unknown })?.events;
  if (!Array.isArray(events)) {
    return NextResponse.json(
      { ok: false, error: 'request body must be { "events": [...] }' },
      { status: 400 }
    );
  }
  if (events.length > MAX_EVENTS_PER_REQUEST) {
    return NextResponse.json(
      { ok: false, error: `at most ${MAX_EVENTS_PER_REQUEST} events per request` },
      { status: 400 }
    );
  }

  const now = new Date();
  const observations: SourceObservation[] = [];
  const dropped: DroppedEvent[] = [];
  events.forEach((raw, index) => {
    const result = validateEvent(raw, now);
    if ("observation" in result) {
      observations.push(result.observation);
    } else {
      dropped.push({ index, title: result.title, reason: result.drop });
    }
  });

  const result = await reconcileSource({
    db: getAdminDb(),
    source: AGENT_SOURCE,
    observations,
    checkedAt: now,
    from: new Date(now.getTime() - MAX_PAST_DAYS * 86_400_000),
    to: new Date(now.getTime() + MAX_FUTURE_DAYS * 86_400_000),
    // complete:true lets already-published agent events go missing/stale when
    // they disappear from later pushes. An empty push never marks anything
    // missing: reconcileSource guards that case internally.
    complete: true,
    write: true,
  });

  const counts = result as {
    created?: number; updated?: number; verified?: number;
    candidates?: number; safetyHeld?: boolean;
  };
  return NextResponse.json({
    ok: true,
    source: SOURCE_ID,
    received: events.length,
    accepted: observations.length,
    dropped,
    created: counts.created ?? 0,
    updated: counts.updated ?? 0,
    verified: counts.verified ?? 0,
    candidates: counts.candidates ?? 0,
    safetyHeld: counts.safetyHeld ?? false,
  });
}
