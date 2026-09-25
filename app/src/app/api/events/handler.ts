import { EVENT_CATEGORIES, type EventCategory } from "@/lib/events/types";
import {
  DEFAULT_SEARCH_HORIZON_DAYS,
  type EventRepository,
  type SearchableEvent,
} from "@/lib/search/event-retrieval";
import { eventPageUrl } from "@/lib/seo/event-jsonld";

const SEARCH_TIME_ZONE = "America/New_York";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const FETCH_MULTIPLIER = 3;

export interface PublicEvent {
  id: string;
  url: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string | null;
  location: string;
  town: string;
  category: EventCategory;
  status: SearchableEvent["status"];
  availability: SearchableEvent["availability"];
  sourceUrl: string;
  imageUrl?: string;
  lastVerifiedAt: string;
}

export interface PublicEventsQuery {
  town?: string;
  category?: string;
  from?: string;
  to?: string;
  limit?: string;
}

export interface PublicEventsDeps {
  repository: EventRepository;
  now?: Date;
  siteOrigin?: string;
}

const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/;

function etDateString(iso: string): string | null {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SEARCH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(time));
}

function todayEt(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SEARCH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

function toPublicEvent(event: SearchableEvent, siteOrigin: string): PublicEvent {
  const publicEvent: PublicEvent = {
    id: event.id,
    url: eventPageUrl(event.id, siteOrigin),
    title: event.title,
    description: event.description,
    startDate: event.date,
    endDate: event.endDate,
    location: event.location,
    town: event.town,
    category: event.category,
    status: event.status,
    availability: event.availability,
    sourceUrl: event.sourceUrl,
    lastVerifiedAt: event.lastVerifiedAt,
  };
  if (event.imageUrl) publicEvent.imageUrl = event.imageUrl;
  return publicEvent;
}

/**
 * GET /api/events — public machine-readable feed of published upcoming events.
 * Query params: town, category, from (YYYY-MM-DD), to (YYYY-MM-DD), limit.
 */
export async function handlePublicEvents(
  request: Request,
  deps: PublicEventsDeps,
): Promise<Response> {
  const url = new URL(request.url);
  const params: PublicEventsQuery = {
    town: url.searchParams.get("town") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  };

  const now = deps.now ?? new Date();
  const siteOrigin = deps.siteOrigin ?? "https://westfieldbuzz.com";

  let category: EventCategory | undefined;
  if (params.category) {
    const match = (EVENT_CATEGORIES as readonly string[]).find(
      (candidate) => candidate.toLowerCase() === params.category!.toLowerCase(),
    );
    if (!match) {
      return badRequest(
        `Unknown category. Valid values: ${EVENT_CATEGORIES.join(", ")}`,
      );
    }
    category = match as EventCategory;
  }

  if (params.from && !DATE_PARAM.test(params.from)) {
    return badRequest("Invalid from date. Use YYYY-MM-DD.");
  }
  if (params.to && !DATE_PARAM.test(params.to)) {
    return badRequest("Invalid to date. Use YYYY-MM-DD.");
  }
  const fromDay = params.from ?? todayEt(now);
  const toDay = params.to ?? addDays(fromDay, DEFAULT_SEARCH_HORIZON_DAYS);
  if (toDay < fromDay) {
    return badRequest("to must be on or after from.");
  }

  let limit = DEFAULT_LIMIT;
  if (params.limit !== undefined) {
    const parsed = Number(params.limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      return badRequest(`limit must be an integer between 1 and ${MAX_LIMIT}.`);
    }
    limit = parsed;
  }

  const townFilter = params.town?.trim().toLowerCase();

  let events: SearchableEvent[];
  try {
    // Pad the Firestore window by a day on each side, then filter on exact
    // Eastern calendar days in memory so from/to mean ET days, not UTC days.
    events = await deps.repository.listPublishedEvents({
      from: new Date(`${addDays(fromDay, -1)}T00:00:00Z`),
      to: new Date(`${addDays(toDay, 1)}T23:59:59.999Z`),
      limit: Math.min(limit * FETCH_MULTIPLIER, 1000),
    });
  } catch {
    return Response.json(
      { error: "Events are temporarily unavailable. Try again shortly." },
      { status: 503 },
    );
  }

  const filtered = events
    .filter((event) => {
      const day = etDateString(event.date);
      if (!day || day < fromDay || day > toDay) return false;
      if (townFilter && event.town.trim().toLowerCase() !== townFilter) return false;
      if (category && event.category !== category) return false;
      return true;
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(0, limit);

  return Response.json(
    {
      events: filtered.map((event) => toPublicEvent(event, siteOrigin)),
      count: filtered.length,
      generatedAt: now.toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
