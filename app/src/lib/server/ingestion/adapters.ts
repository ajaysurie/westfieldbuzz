import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expandRecurringEvent, sync as icalSync, type VEvent } from "node-ical";
import { normalizeWhitespace } from "../../events/normalize";
import { parseSourceDateTime } from "./time";
import { mapCategory } from "./source-registry";
import { extractEventsWithLlm } from "./llm-extractor";
import type {
  EventSourcePolicy,
  SourceFetchResult,
  SourceObservation,
} from "./types";
import { safeFetchText, type FetchImplementation } from "./safe-fetch";

interface DateWindow {
  from: Date;
  to: Date;
  fromLocalDate: string;
  toLocalDate: string;
}

interface ParsedPayload {
  events: SourceObservation[];
  errors: string[];
  warnings?: string[];
  layoutValid: boolean;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(
    /&(#x?[0-9a-f]+|[a-z]+);/gi,
    (match, entity: string) => {
      if (entity.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      }
      if (entity.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      }
      return named[entity.toLowerCase()] ?? match;
    }
  );
}

export function stripHtml(value: unknown): string {
  return normalizeWhitespace(
    decodeHtmlEntities(
      String(value ?? "")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/p>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return stripHtml(value);
  }
  const data = record(value);
  return stripHtml(data.val ?? data.value ?? data.name ?? "");
}

export function humanVenue(value: unknown, fallback: string): string {
  const venue = text(value);
  return /^https?:\/\//i.test(venue) || /\b[a-z0-9.-]+\.[a-z]{2,}\/\S*/i.test(venue)
    ? fallback
    : venue || fallback;
}

function withinWindow(
  start: Date,
  end: Date | null,
  window: DateWindow
): boolean {
  if (start > window.to) return false;
  return (end ?? start) >= window.from;
}

function invalidDate(value: Date): boolean {
  return Number.isNaN(value.getTime());
}

function eventStatus(value: unknown): SourceObservation["status"] {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("cancel")) return "cancelled";
  if (normalized.includes("postpon")) return "postponed";
  if (normalized.includes("reschedul")) return "rescheduled";
  if (normalized.includes("weather")) return "weather-dependent";
  return "scheduled";
}

export function isJunkEvent(
  source: EventSourcePolicy,
  event: Pick<SourceObservation, "title" | "location">
): boolean {
  if (!event.title.trim()) return true;
  return (source.junkTitlePatterns ?? []).some((pattern) =>
    new RegExp(pattern, "i").test(event.title.trim())
  );
}

export function deduplicateObservations(
  source: EventSourcePolicy,
  events: SourceObservation[]
): { events: SourceObservation[]; warnings: string[] } {
  const byId = new Map<string, SourceObservation>();
  const warnings: string[] = [];
  for (const event of events) {
    if (isJunkEvent(source, event)) {
      warnings.push(`Filtered junk event: ${event.title || "(untitled)"}`);
      continue;
    }
    if (byId.has(event.sourceEventId)) {
      warnings.push(`Ignored duplicate source event ID: ${event.sourceEventId}`);
      continue;
    }
    byId.set(event.sourceEventId, event);
  }
  return { events: [...byId.values()], warnings };
}

function libCalCategories(event: UnknownRecord): string[] {
  const values = [
    ...array(event.categories_arr),
    ...array(event.audiences),
    ...array(event.categories),
  ];
  if (typeof event.categories === "string") values.push(event.categories);
  return values.map(text).filter(Boolean);
}

export function parseLibCalPayload(
  source: EventSourcePolicy,
  payload: unknown,
  window: DateWindow
): ParsedPayload {
  const data = record(payload);
  const rawEvents = array(data.events ?? data.results);
  const errors: string[] = [];
  const events: SourceObservation[] = [];

  for (const raw of rawEvents) {
    const event = record(raw);
    const title = text(event.title);
    const startRaw = event.startdt ?? event.start_date ?? event.start;
    const endRaw = event.enddt ?? event.end_date ?? event.end;
    const start = parseSourceDateTime(startRaw, source.timezone);
    const end = endRaw ? parseSourceDateTime(endRaw, source.timezone) : null;
    if (invalidDate(start)) {
      errors.push(`Invalid start date for ${title || "untitled LibCal event"}`);
      continue;
    }
    if (end && invalidDate(end)) {
      errors.push(`Invalid end date for ${title || "untitled LibCal event"}`);
      continue;
    }
    if (!withinWindow(start, end, window)) continue;
    const locationValue = record(event.location);
    const location = humanVenue(locationValue.name ?? event.location, source.name);
    events.push({
      title,
      description: stripHtml(event.description ?? event.shortdesc),
      date: start,
      endDate: end,
      location,
      town: source.town,
      category: mapCategory(libCalCategories(event)),
      status: eventStatus(event.status),
      availability: "unknown",
      sourceId: source.id,
      sourceEventId:
        event.id != null
          ? String(event.id)
          : `fallback:${start.toISOString()}:${title}:${location}`,
      sourceUrl:
        text(record(event.url).public ?? event.url) ||
        source.publicUrl ||
        source.url,
    });
  }

  return {
    events,
    errors,
    layoutValid: Array.isArray(data.events) || Array.isArray(data.results),
  };
}

function icalInstances(event: VEvent, window: DateWindow) {
  if (event.rrule) {
    return expandRecurringEvent(event, {
      from: window.from,
      to: window.to,
      includeOverrides: true,
      excludeExdates: true,
      expandOngoing: true,
    });
  }
  return [
    {
      start: event.start,
      end: event.end,
      summary: event.summary,
      isRecurring: false,
      event,
    },
  ];
}

export function parseICalPayload(
  source: EventSourcePolicy,
  payload: string,
  window: DateWindow
): ParsedPayload {
  const errors: string[] = [];
  const events: SourceObservation[] = [];
  let calendar: ReturnType<typeof icalSync.parseICS>;
  try {
    calendar = icalSync.parseICS(payload);
  } catch (error) {
    return {
      events: [],
      errors: [error instanceof Error ? error.message : String(error)],
      layoutValid: false,
    };
  }

  for (const [key, component] of Object.entries(calendar)) {
    if (!component || component.type !== "VEVENT") continue;
    const event = component as VEvent;
    try {
      for (const instance of icalInstances(event, window)) {
        // `instance.event` is the effective VEVENT, including a RECURRENCE-ID
        // override. Its start may have moved, but recurrenceid is the immutable
        // slot that identifies the occurrence across updates.
        const effectiveEvent = instance.event;
        // Expanded instance times are authoritative for an RRULE occurrence.
        // For a generated instance, instance.event can be the base VEVENT
        // whose DTSTART is the series origin rather than this occurrence.
        const startValue = instance.start ?? effectiveEvent.start;
        const endValue = instance.end ?? effectiveEvent.end;
        const start = startValue ? new Date(startValue) : new Date(Number.NaN);
        const end = endValue ? new Date(endValue) : null;
        const title = text(effectiveEvent.summary ?? instance.summary ?? event.summary);
        if (invalidDate(start)) {
          errors.push(`Invalid start date for ${title || "untitled iCal event"}`);
          continue;
        }
        if (end && invalidDate(end)) {
          errors.push(`Invalid end date for ${title || "untitled iCal event"}`);
          continue;
        }
        if (!withinWindow(start, end, window)) continue;
        const baseId = text(event.uid) || key;
        const originalSlot = instance.isRecurring
          ? new Date(effectiveEvent.recurrenceid ?? instance.start)
          : null;
        const sourceEventId = originalSlot
          ? `${baseId}:${originalSlot.toISOString()}`
          : baseId;
        const legacySourceEventId = instance.isRecurring
          ? `${baseId}:${start.toISOString()}`
          : null;
        events.push({
          title,
          description: text(effectiveEvent.description ?? event.description),
          date: start,
          endDate: end,
          location: humanVenue(effectiveEvent.location ?? event.location, source.name),
          town: source.town,
          category: mapCategory([
            ...(effectiveEvent.categories?.length
              ? effectiveEvent.categories
              : event.categories ?? []),
            source.name,
          ]),
          status: eventStatus(effectiveEvent.status ?? event.status),
          availability: "unknown",
          sourceId: source.id,
          sourceEventId,
          ...(legacySourceEventId && legacySourceEventId !== sourceEventId
            ? { sourceEventAliases: [legacySourceEventId] }
            : {}),
          sourceUrl: text(effectiveEvent.url ?? event.url) || source.publicUrl || source.url,
        });
      }
    } catch (error) {
      errors.push(
        `Failed to expand ${text(event.summary) || key}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  return {
    events,
    errors,
    layoutValid: /BEGIN:VCALENDAR/i.test(payload),
  };
}

function dateFromSquarespace(value: unknown): Date {
  if (typeof value === "number") return new Date(value);
  const numeric = Number(value);
  if (String(value ?? "").trim() && Number.isFinite(numeric) && numeric > 10_000) {
    return new Date(numeric);
  }
  return new Date(String(value ?? ""));
}

function squarespaceLocation(value: unknown, fallback: string): string {
  const location = record(value);
  return (
    [
      location.addressTitle,
      location.addressLine1,
      location.addressLine2,
    ]
      .map(text)
      .filter(Boolean)
      .join(", ") || fallback
  );
}

export function parseSquarespacePayload(
  source: EventSourcePolicy,
  payload: unknown,
  window: DateWindow
): ParsedPayload {
  const data = record(payload);
  const items = array(data.items);
  const errors: string[] = [];
  const events: SourceObservation[] = [];

  for (const raw of items) {
    const item = record(raw);
    const title = text(item.title);
    const start = dateFromSquarespace(
      item.startDate ?? item.eventStartDate ?? item.eventDate
    );
    const endValue = item.endDate ?? item.eventEndDate;
    const end = endValue ? dateFromSquarespace(endValue) : null;
    if (invalidDate(start)) {
      errors.push(`Invalid start date for ${title || "untitled Squarespace event"}`);
      continue;
    }
    if (end && invalidDate(end)) {
      errors.push(`Invalid end date for ${title || "untitled Squarespace event"}`);
      continue;
    }
    if (!withinWindow(start, end, window)) continue;
    const urlPath = text(item.fullUrl ?? item.urlId);
    events.push({
      title,
      description: stripHtml(item.excerpt ?? item.body),
      date: start,
      endDate: end,
      location: squarespaceLocation(item.location, source.name),
      town: source.town,
      category: mapCategory([source.name, ...array(item.categories).map(text)]),
      status: eventStatus(item.status),
      availability: "unknown",
      sourceId: source.id,
      sourceEventId: text(item.id) || `fallback:${start.toISOString()}:${title}`,
      sourceUrl: urlPath
        ? new URL(urlPath, source.url).toString()
        : source.publicUrl ?? source.url.replace(/[?&]format=json/, ""),
    });
  }

  return {
    events,
    errors,
    layoutValid: Array.isArray(data.items) && Boolean(data.collection),
  };
}

function classText(block: string, className: string): string {
  const expression = new RegExp(
    `<([a-z0-9]+)[^>]+class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
    "i"
  );
  return stripHtml(block.match(expression)?.[2] ?? "");
}

function mecDate(block: string, source: EventSourcePolicy): { start: Date; end: Date | null } {
  const yearMonth = block.match(/mec-toggle-(\d{4})(\d{2})/i);
  const dayMonth = classText(block, "mec-start-date-label").match(/(\d{1,2})\s+([A-Za-z]{3})/);
  if (!yearMonth || !dayMonth) {
    return { start: new Date(Number.NaN), end: null };
  }
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const month = months.indexOf(dayMonth[2].toLowerCase()) + 1;
  const startTime = classText(block, "mec-start-time") || "12:00 am";
  const endTime = classText(block, "mec-end-time");
  const timeParts = (value: string) => {
    const match = value.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (!match) return null;
    let hour = Number(match[1]) % 12;
    if (match[3].toLowerCase() === "pm") hour += 12;
    return `${String(hour).padStart(2, "0")}:${match[2] ?? "00"}:00`;
  };
  const date = `${yearMonth[1]}-${String(month).padStart(2, "0")}-${String(Number(dayMonth[1])).padStart(2, "0")}`;
  const startClock = timeParts(startTime);
  const endClock = endTime ? timeParts(endTime) : null;
  return {
    start: startClock
      ? parseSourceDateTime(`${date} ${startClock}`, source.timezone)
      : new Date(Number.NaN),
    end: endClock
      ? parseSourceDateTime(`${date} ${endClock}`, source.timezone)
      : null,
  };
}

export function parseMecHtml(
  source: EventSourcePolicy,
  html: string,
  window: DateWindow
): ParsedPayload {
  const errors: string[] = [];
  const events: SourceObservation[] = [];
  const articles = html.match(
    /<article\b[^>]*class=["'][^"']*mec-event-article[^"']*["'][^>]*>[\s\S]*?<\/article>/gi
  ) ?? [];

  for (const article of articles) {
    const title = classText(article, "mec-event-title");
    const id = article.match(/data-event-id=["'](\d+)["']/i)?.[1];
    const href = article.match(
      /class=["'][^"']*mec-color-hover[^"']*["'][^>]*href=["']([^"']+)["']/i
    )?.[1];
    const { start, end } = mecDate(article, source);
    if (invalidDate(start)) {
      errors.push(`Invalid start date for ${title || "untitled MEC event"}`);
      continue;
    }
    if (!withinWindow(start, end, window)) continue;
    events.push({
      title,
      description: classText(article, "mec-event-description"),
      date: start,
      endDate: end,
      location: classText(article, "mec-venue-details") || source.name,
      town: source.town,
      category: mapCategory([source.name]),
      status: eventStatus(classText(article, "mec-event-status")),
      availability: "unknown",
      sourceId: source.id,
      sourceEventId: id || `fallback:${start.toISOString()}:${title}`,
      sourceUrl: href
        ? decodeHtmlEntities(href)
        : source.publicUrl ?? source.url,
      imageUrl: safeImageUrl(
        article.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1]
          ? decodeHtmlEntities(article.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)![1])
          : undefined
      ),
    });
  }

  return {
    events,
    errors,
    layoutValid: html.includes(source.expectedLayoutMarker ?? "mec-event-article"),
  };
}

export function parseTribePayload(
  source: EventSourcePolicy,
  payload: unknown,
  window: DateWindow
): ParsedPayload {
  const data = record(payload);
  const rawEvents = array(data.events);
  const errors: string[] = [];
  const events: SourceObservation[] = [];

  for (const raw of rawEvents) {
    const event = record(raw);
    const title = text(event.title);
    const start = parseSourceDateTime(event.start_date, source.timezone);
    const end = event.end_date
      ? parseSourceDateTime(event.end_date, source.timezone)
      : null;
    if (invalidDate(start)) {
      errors.push(`Invalid start date for ${title || "untitled Tribe event"}`);
      continue;
    }
    if (end && invalidDate(end)) {
      errors.push(`Invalid end date for ${title || "untitled Tribe event"}`);
      continue;
    }
    if (!withinWindow(start, end, window)) continue;
    const venue = record(event.venue);
    const categories = array(event.categories).map((value) => text(record(value).name));
    events.push({
      title,
      description: stripHtml(event.description ?? event.excerpt),
      date: start,
      endDate: end,
      location: text(venue.venue ?? venue.name) || source.name,
      town: source.town,
      category: mapCategory([...categories, source.name]),
      status: eventStatus(event.status),
      availability: text(event.cost).toLowerCase().includes("sold out")
        ? "sold-out"
        : "unknown",
      sourceId: source.id,
      sourceEventId: text(event.id ?? event.global_id),
      sourceUrl: text(event.url) || source.publicUrl || source.url,
      imageUrl: safeImageUrl(record(event.image).url ?? event.image),
    });
  }

  return {
    events,
    errors,
    layoutValid: Array.isArray(data.events),
  };
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(
      `Source returned malformed JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

async function fetchOne(
  source: EventSourcePolicy,
  url: string,
  fetchImpl?: FetchImplementation,
  deadlineAt?: Date
) {
  return safeFetchText({ url, policy: source, fetchImpl, deadlineAt });
}

function finalize(
  source: EventSourcePolicy,
  parsed: ParsedPayload,
  responseBytes: number,
  fetchedUrl: string
): SourceFetchResult {
  const unique = deduplicateObservations(source, parsed.events);
  const errors = [...parsed.errors];
  if (!parsed.layoutValid) errors.push("Expected source layout marker was missing");
  if (
    source.minimumExpectedEvents != null &&
    unique.events.length < source.minimumExpectedEvents
  ) {
    errors.push(
      `Event count ${unique.events.length} is below minimum ${source.minimumExpectedEvents}`
    );
  }
  return {
    events: unique.events,
    complete: errors.length === 0,
    errors,
    warnings: [...(parsed.warnings ?? []), ...unique.warnings],
    responseBytes,
    fetchedUrl,
  };
}

/** schema.org event types we accept. Subtypes carry the same core fields. */
const JSON_LD_EVENT_TYPES = new Set([
  "event", "musicevent", "theaterevent", "socialevent", "festival",
  "sportsevent", "educationevent", "comedyevent", "danceevent",
  "exhibitionevent", "literaryevent", "screeningevent", "foodevent",
  "childrensevent", "businessevent", "publicationevent",
]);

function isJsonLdEvent(value: UnknownRecord): boolean {
  const raw = value["@type"];
  const types = Array.isArray(raw) ? raw : [raw];
  return types.some((entry) => JSON_LD_EVENT_TYPES.has(text(entry).toLowerCase()));
}

/**
 * Publishers nest events inconsistently: bare objects, arrays, @graph, and
 * ItemList/itemListElement wrappers all appear in the wild. Walking the whole
 * document is more durable than encoding any one publisher's shape.
 */
function collectJsonLdEvents(value: unknown, found: UnknownRecord[], depth = 0): void {
  if (depth > 8 || found.length >= 500) return;
  if (Array.isArray(value)) {
    for (const entry of value) collectJsonLdEvents(entry, found, depth + 1);
    return;
  }
  if (!value || typeof value !== "object") return;
  const node = value as UnknownRecord;
  if (isJsonLdEvent(node)) found.push(node);
  for (const key of ["@graph", "itemListElement", "item", "subEvent", "events"]) {
    if (key in node) collectJsonLdEvents(node[key], found, depth + 1);
  }
}

/** schema.org eventStatus and offer availability are namespaced URLs. */
function schemaEnumTail(value: unknown): string {
  return text(value).split("/").pop()?.toLowerCase() ?? "";
}

function jsonLdStatus(value: unknown): SourceObservation["status"] {
  const tail = schemaEnumTail(value);
  if (tail === "eventcancelled") return "cancelled";
  if (tail === "eventpostponed") return "postponed";
  if (tail === "eventrescheduled") return "rescheduled";
  return "scheduled";
}

function jsonLdAvailability(offers: unknown): SourceObservation["availability"] {
  const entries = Array.isArray(offers) ? offers : [offers];
  for (const entry of entries) {
    const tail = schemaEnumTail(record(entry).availability);
    if (tail === "soldout") return "sold-out";
    if (tail === "instock" || tail === "limitedavailability") return "available";
    if (tail === "preorder" || tail === "backorder") return "registration-required";
  }
  return "unknown";
}

function jsonLdLocation(value: unknown): string {
  const entries = Array.isArray(value) ? value : [value];
  for (const entry of entries) {
    const place = record(entry);
    const name = text(place.name);
    const address = record(place.address);
    const street = text(address.streetAddress);
    const locality = text(address.addressLocality);
    const parts = [name, street, locality].filter(Boolean);
    if (parts.length) return parts.join(", ");
    if (typeof entry === "string" && entry.trim()) return entry.trim();
  }
  return "";
}

function jsonLdImage(value: unknown): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === "string") return safeImageUrl(first);
  const obj = record(first);
  return safeImageUrl(obj.url ?? obj.contentUrl);
}

export function parseJsonLdPayload(
  source: EventSourcePolicy,
  html: string,
  window: DateWindow
): ParsedPayload {
  const errors: string[] = [];
  const events: SourceObservation[] = [];
  const blocks = html.match(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  ) ?? [];

  const found: UnknownRecord[] = [];
  const usedSourceEventIds = new Set<string>();
  for (const block of blocks) {
    const body = block.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "");
    try {
      collectJsonLdEvents(JSON.parse(body), found);
    } catch {
      // One malformed block must not discard the others on the page.
      errors.push("Malformed JSON-LD block skipped");
    }
  }

  for (const node of found) {
    const title = text(node.name);
    const start = parseSourceDateTime(node.startDate, source.timezone);
    const end = node.endDate ? parseSourceDateTime(node.endDate, source.timezone) : null;
    if (invalidDate(start)) {
      errors.push(`Invalid start date for ${title || "untitled JSON-LD event"}`);
      continue;
    }
    if (end && invalidDate(end)) {
      errors.push(`Invalid end date for ${title || "untitled JSON-LD event"}`);
      continue;
    }
    if (!withinWindow(start, end, window)) continue;
    const url = text(node.url) || text(node["@id"]);
    // Multi-night runs emit one node per date but reuse the same event URL.
    // Keying purely on the URL would collapse every night into the first, so
    // repeat occurrences get a start-time suffix. First occurrences keep the
    // bare URL so single-event pages reconcile exactly as before.
    let sourceEventId = url || `fallback:${start.toISOString()}:${title}`;
    if (usedSourceEventIds.has(sourceEventId)) {
      sourceEventId = `${sourceEventId}#${start.toISOString()}`;
    }
    usedSourceEventIds.add(sourceEventId);
    events.push({
      title,
      description: stripHtml(node.description),
      date: start,
      endDate: end,
      location: jsonLdLocation(node.location) || source.name,
      town: source.town,
      category: mapCategory([title, text(record(node.superEvent).name), source.name]),
      status: jsonLdStatus(node.eventStatus),
      availability: jsonLdAvailability(node.offers),
      sourceId: source.id,
      // Prefer the publisher's own identifier so reruns reconcile instead of
      // creating duplicates; fall back to start plus title only when absent.
      sourceEventId,
      sourceUrl: url || source.publicUrl || source.url,
      imageUrl: jsonLdImage(node.image),
    });
  }

  return {
    events,
    errors,
    // A page with no JSON-LD at all is a layout change, not an empty calendar.
    layoutValid: blocks.length > 0,
  };
}

/** Extracts the balanced [...] array literal following `"key":` in a blob of
 * embedded page JSON. Returns null when the key or a parseable array is absent. */
function extractJsonArrayField(html: string, key: string): unknown[] | null {
  const keyIndex = html.indexOf(`"${key}"`);
  if (keyIndex === -1) return null;
  const start = html.indexOf("[", keyIndex);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i += 1) {
    const ch = html[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "[") depth += 1;
    if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed: unknown = JSON.parse(html.slice(start, i + 1));
          return Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Eventbrite organizer pages embed the organizer's upcoming events as a JSON
 * array in the initial page state — the authoritative listing the venue itself
 * publishes for tickets, so it reconciles cleanly and can auto-approve. */
export function parseEventbriteOrganizerPayload(
  source: EventSourcePolicy,
  html: string,
  window: DateWindow
): ParsedPayload {
  const errors: string[] = [];
  const events: SourceObservation[] = [];
  const layoutValid = html.includes('"upcomingEvents"');
  const items = extractJsonArrayField(html, "upcomingEvents") ?? [];

  for (const item of items) {
    const event = record(item);
    const title = text(event.name);
    const tz = text(event.timezone) || source.timezone;
    const start = parseSourceDateTime(
      `${text(event.start_date)} ${text(event.start_time)}`.trim(), tz);
    const endRaw = `${text(event.end_date)} ${text(event.end_time)}`.trim();
    const end = endRaw ? parseSourceDateTime(endRaw, tz) : null;
    if (invalidDate(start)) {
      errors.push(`Invalid start date for ${title || "untitled Eventbrite event"}`);
      continue;
    }
    if (!withinWindow(start, end, window)) continue;
    const venue = record(event.primary_venue);
    const address = record(venue.address);
    const locationParts = [text(venue.name), text(address.address_1), text(address.city)]
      .filter(Boolean);
    const eventId = text(event.eventbrite_event_id) || text(event.id);
    const url = text(event.url);
    events.push({
      title,
      description: stripHtml(event.summary),
      date: start,
      endDate: end,
      location: locationParts.join(", ") || source.name,
      town: source.town,
      category: mapCategory([title, source.name]),
      status: event.is_cancelled === true ? "cancelled" : "scheduled",
      availability: "unknown",
      sourceId: source.id,
      sourceEventId: eventId || url || `fallback:${start.toISOString()}:${title}`,
      sourceUrl: url || source.publicUrl || source.url,
      imageUrl: safeImageUrl(record(event.image).url),
    });
  }

  return { events, errors, layoutValid };
}

const DEFAULT_MAX_DETAIL_PAGES = 30;
const DETAIL_CRAWL_DELAY_MS = 250;
const DETAIL_CRAWL_RETRY_MS = 1_000;
const DEFAULT_MAX_IG_POSTS = 12;
const IG_POST_DELAY_MS = 400;
const IG_GRID_SETTLE_MS = 1_500;
const BROWSE_BIN =
  process.env.WESTFIELDBUZZ_BROWSE_BIN ??
  `${process.env.HOME}/.agents/skills/browse/dist/browse`;

const execFileAsync = promisify(execFile);

/** Runs the local `browse` CLI against the persistent browser session. The
 * session carries the operator's logged-in Instagram cookies, so this only
 * exists on a machine where that import was performed — on Vercel there is no
 * session and the source fails fast instead of hitting the login wall. */
export type BrowseExec = (args: string[]) => Promise<string>;

function defaultBrowseExec(bin: string): BrowseExec {
  return async (args) => {
    const { stdout } = await execFileAsync(bin, args, {
      timeout: 45_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout;
  };
}

function parseBrowseJson(stdout: string): unknown {
  const start = stdout.search(/[[{]/);
  if (start === -1) throw new Error("browse returned no JSON");
  return JSON.parse(stdout.slice(start));
}

/** Reads an Instagram profile's recent post captions through the browse
 * session. Returns one text block per post — "POST <url> — posted <iso>"
 * followed by the caption — which the LLM extractor treats as page text. */
async function fetchInstagramProfileText(
  source: EventSourcePolicy,
  exec: BrowseExec,
  deadlineAt?: Date
): Promise<{ text: string; errors: string[]; warnings: string[]; bytes: number }> {
  const errors: string[] = [];
  const warnings: string[] = [];
  await exec(["goto", source.url]);
  const linksExpr =
    "Array.from(document.querySelectorAll('a[href*=\"/p/\"],a[href*=\"/reel/\"]'))" +
    ".map(a=>a.href).filter(h=>/instagram\\.com\\/[^/]+\\/(p|reel)\\//.test(h))";
  // The post grid lazy-renders after navigation; give it a beat, scroll to
  // trigger it, then retry once before declaring the session logged out.
  let links: string[] = [];
  for (let attempt = 0; attempt < 2 && links.length === 0; attempt++) {
    await sleep(IG_GRID_SETTLE_MS);
    await exec(["js", "window.scrollTo(0, 1500); 'scrolled'"]);
    await sleep(IG_GRID_SETTLE_MS);
    const linksRaw = parseBrowseJson(await exec(["js", linksExpr]));
    links = [...new Set(array(linksRaw).map((l) => text(l)).filter(Boolean))];
  }
  const cap = source.maxPosts ?? DEFAULT_MAX_IG_POSTS;
  const blocks: string[] = [];
  let bytes = 0;
  let fetched = 0;
  for (const link of links.slice(0, cap)) {
    if (deadlineAt && new Date() >= deadlineAt) {
      warnings.push(`Post crawl stopped at ${fetched}/${links.length} posts: deadline reached`);
      break;
    }
    try {
      if (fetched > 0) await sleep(IG_POST_DELAY_MS);
      await exec(["goto", link]);
      const post = record(
        parseBrowseJson(
          await exec([
            "js",
            "({caption:(document.querySelector('meta[property=\"og:description\"]')||{}).content||''," +
              "posted:(document.querySelector('time')||{}).dateTime||''})",
          ])
        )
      );
      fetched += 1;
      const caption = text(post.caption);
      if (!caption) {
        warnings.push(`${link}: no caption found on post page`);
        continue;
      }
      bytes += caption.length;
      blocks.push(`POST ${link} — posted ${text(post.posted) || "unknown"}\n${caption}`);
    } catch (error) {
      errors.push(`${link}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (links.length === 0) {
    errors.push("Profile rendered no post links — session may be logged out");
  }
  return { text: blocks.join("\n\n"), errors, warnings, bytes };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Index pages (e.g. a venue's /events listing) only link out to detail pages;
 * the JSON-LD lives on each detail page. Links are constrained to the source's
 * allowed hosts so a poisoned index cannot steer the crawler off-site.
 */
export function extractDetailLinks(
  html: string,
  indexUrl: string,
  source: EventSourcePolicy
): string[] {
  const pattern = new RegExp(source.detailLinkPattern ?? "$.", "i");
  const allowed = new Set(source.allowedHosts.map((host) => host.toLowerCase()));
  const links = new Set<string>();
  for (const match of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    let url: URL;
    try {
      url = new URL(match[1], indexUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "https:") continue;
    if (!allowed.has(url.hostname.toLowerCase())) continue;
    if (!pattern.test(url.pathname)) continue;
    url.hash = "";
    links.add(url.toString());
  }
  return [...links];
}


/** Accept only absolute http(s) image URLs; anything else is dropped so a source
 *  cannot inject a javascript: or data: URL into a rendered card. */
function safeImageUrl(value: unknown): string | undefined {
  const raw = text(value);
  if (!/^https?:\/\//i.test(raw)) return undefined;
  return raw;
}

export async function fetchSourceEvents(input: {
  source: EventSourcePolicy;
  window: DateWindow;
  fetchImpl?: FetchImplementation;
  execImpl?: BrowseExec;
  deadlineAt?: Date;
}): Promise<SourceFetchResult> {
  const { source, window, fetchImpl, execImpl, deadlineAt } = input;
  if (source.type === "libcal") {
    const all: SourceObservation[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    let bytes = 0;
    let fetchedUrl = source.url;
    for (let page = 1; page <= 20; page++) {
      const url = new URL(source.url);
      url.searchParams.set("c", source.calendarId ?? "");
      url.searchParams.set("date", window.fromLocalDate);
      url.searchParams.set("perpage", "50");
      url.searchParams.set("page", String(page));
      const response = await fetchOne(source, url.toString(), fetchImpl, deadlineAt);
      bytes += response.bytes;
      fetchedUrl = response.finalUrl;
      const payload = parseJson(response.text);
      const parsed = parseLibCalPayload(source, payload, window);
      all.push(...parsed.events);
      errors.push(...parsed.errors);
      warnings.push(...(parsed.warnings ?? []));
      if (!parsed.layoutValid) errors.push("Expected LibCal events array was missing");
      const payloadRecord = record(payload);
      const rawCount = array(payloadRecord.events ?? payloadRecord.results).length;
      if (rawCount < 50) break;
      if (page === 20) errors.push("LibCal pagination exceeded 20 pages");
    }
    return finalize(
      source,
      { events: all, errors, warnings, layoutValid: true },
      bytes,
      fetchedUrl
    );
  }

  if (source.type === "ical" || source.type === "civicplus-ical") {
    const urls = source.calendarIds?.length
      ? source.calendarIds.map((calendarId) => {
          const url = new URL(source.url);
          url.searchParams.set("catID", String(calendarId));
          url.searchParams.set("feed", "calendar");
          return url.toString();
        })
      : [source.url];
    const all: SourceObservation[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    let bytes = 0;
    let fetchedUrl = source.url;
    for (const url of urls) {
      try {
        const response = await fetchOne(source, url, fetchImpl, deadlineAt);
        bytes += response.bytes;
        fetchedUrl = response.finalUrl;
        const parsed = parseICalPayload(source, response.text, window);
        all.push(...parsed.events);
        errors.push(...parsed.errors);
        warnings.push(...(parsed.warnings ?? []));
        if (!parsed.layoutValid) errors.push("Expected iCalendar envelope was missing");
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    return finalize(
      source,
      { events: all, errors, warnings, layoutValid: urls.length > 0 },
      bytes,
      fetchedUrl
    );
  }

  if (source.type === "squarespace-json") {
    const response = await fetchOne(source, source.url, fetchImpl, deadlineAt);
    return finalize(
      source,
      parseSquarespacePayload(source, parseJson(response.text), window),
      response.bytes,
      response.finalUrl
    );
  }

  if (source.type === "eventbrite-organizer") {
    const response = await fetchOne(source, source.url, fetchImpl, deadlineAt);
    return finalize(
      source,
      parseEventbriteOrganizerPayload(source, response.text, window),
      response.bytes,
      response.finalUrl
    );
  }

  if (source.type === "llm-search") {
    // No page fetch: the model's search grounding is the fetch. Every result
    // must carry its own citation URL or the extractor drops it.
    const extraction = await extractEventsWithLlm({ source, pageText: "", window });
    return finalize(
      source,
      { events: extraction.events, errors: extraction.errors, warnings: extraction.warnings, layoutValid: true },
      0,
      source.url
    );
  }

  if (source.type === "llm-extract") {
    const response = await fetchOne(source, source.url, fetchImpl, deadlineAt);
    const extraction = await extractEventsWithLlm({
      source,
      pageText: stripHtml(response.text),
      window,
    });
    return finalize(
      source,
      {
        events: extraction.events,
        errors: extraction.errors,
        warnings: extraction.warnings,
        // The failure mode here is the model erroring, which surfaces above; an
        // empty page is a real possibility for JS-rendered sites, not a layout break.
        // When a marker is configured it still gates: a renamed listing page
        // (e.g. a rotated season slug) is a layout break, not an empty season.
        layoutValid:
          response.text.length > 0 &&
          (!source.expectedLayoutMarker ||
            response.text.includes(source.expectedLayoutMarker)),
      },
      response.bytes,
      response.finalUrl
    );
  }

  if (source.type === "instagram-profile") {
    const exec = execImpl ?? defaultBrowseExec(BROWSE_BIN);
    let page;
    try {
      page = await fetchInstagramProfileText(source, exec, deadlineAt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return finalize(
        source,
        {
          events: [],
          errors: [`Instagram session fetch failed: ${message}`],
          warnings: [],
          layoutValid: false,
        },
        0,
        source.url
      );
    }
    const extraction = await extractEventsWithLlm({
      source,
      pageText: page.text,
      window,
      fetchImpl,
    });
    // Every extracted event must cite the post URL it came from (enforced in
    // the extractor). Multiple events can share a post, so the stable key
    // appends the event date and title to the post URL.
    for (const event of extraction.events) {
      event.sourceEventId = `${event.sourceEventId}#${event.date
        .toISOString()
        .slice(0, 10)}-${event.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40)}`;
    }
    return finalize(
      source,
      {
        events: extraction.events,
        errors: [...page.errors, ...extraction.errors],
        warnings: [...page.warnings, ...extraction.warnings],
        // No posts means a logged-out or layout-changed session — fail closed.
        layoutValid: page.text.length > 0,
      },
      page.bytes,
      source.url
    );
  }

  if (source.type === "jsonld") {
    const response = await fetchOne(source, source.url, fetchImpl, deadlineAt);
    return finalize(
      source,
      parseJsonLdPayload(source, response.text, window),
      response.bytes,
      response.finalUrl
    );
  }

  if (source.type === "jsonld-index") {
    const index = await fetchOne(source, source.url, fetchImpl, deadlineAt);
    const links = extractDetailLinks(index.text, index.finalUrl, source);
    const cap = source.maxDetailPages ?? DEFAULT_MAX_DETAIL_PAGES;
    const all: SourceObservation[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    let bytes = index.bytes;
    const layoutValid =
      (source.expectedLayoutMarker
        ? index.text.includes(source.expectedLayoutMarker)
        : true) && links.length > 0;
    let fetched = 0;
    for (const link of links.slice(0, cap)) {
      try {
        // Detail crawls fan out tens of requests at one host; unpaced bursts
        // trip rate limiters (SOPAC starts resetting connections around page
        // 20). A short pause plus one retry keeps the crawl polite without a
        // scheduler — the shared deadline still bounds the whole loop.
        if (fetched > 0) await sleep(DETAIL_CRAWL_DELAY_MS);
        let detail;
        try {
          detail = await fetchOne(source, link, fetchImpl, deadlineAt);
        } catch {
          await sleep(DETAIL_CRAWL_RETRY_MS);
          detail = await fetchOne(source, link, fetchImpl, deadlineAt);
        }
        bytes += detail.bytes;
        fetched += 1;
        const parsed = parseJsonLdPayload(source, detail.text, window);
        all.push(...parsed.events);
        errors.push(...parsed.errors);
        warnings.push(...(parsed.warnings ?? []));
        if (!parsed.layoutValid) {
          warnings.push(`${link}: no JSON-LD event found on detail page`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/deadline/i.test(message)) {
          warnings.push(
            `Detail crawl truncated at ${fetched}/${links.length} pages: ${message}`
          );
          break;
        }
        errors.push(`${link}: ${message}`);
      }
    }
    if (links.length > cap) {
      warnings.push(`Detail crawl capped at ${cap} of ${links.length} linked pages`);
    }
    if (links.length === 0) {
      errors.push("Index page linked to no detail pages matching the pattern");
    }
    return finalize(
      source,
      { events: all, errors, warnings, layoutValid },
      bytes,
      index.finalUrl
    );
  }

  if (source.type === "wordpress-mec-html") {
    const response = await fetchOne(source, source.url, fetchImpl, deadlineAt);
    return finalize(
      source,
      parseMecHtml(source, response.text, window),
      response.bytes,
      response.finalUrl
    );
  }

  const url = new URL(source.url);
  url.searchParams.set("start_date", window.fromLocalDate);
  url.searchParams.set("end_date", window.toLocalDate);
  url.searchParams.set("per_page", "50");
  const response = await fetchOne(source, url.toString(), fetchImpl, deadlineAt);
  return finalize(
    source,
    parseTribePayload(source, parseJson(response.text), window),
    response.bytes,
    response.finalUrl
  );
}
