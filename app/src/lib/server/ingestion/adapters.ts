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
    const location = text(locationValue.name ?? event.location) || source.name;
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
          location: text(effectiveEvent.location ?? event.location) || source.name,
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
      sourceEventId: url || `fallback:${start.toISOString()}:${title}`,
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
  deadlineAt?: Date;
}): Promise<SourceFetchResult> {
  const { source, window, fetchImpl, deadlineAt } = input;
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
        layoutValid: response.text.length > 0,
      },
      response.bytes,
      response.finalUrl
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
