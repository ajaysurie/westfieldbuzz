import { SITE_ORIGIN } from "@/lib/site";

const LOCAL_TIME_ZONE = "America/New_York";

export interface CalendarEventInput {
  id: string;
  title: string;
  description: string;
  start: Date;
  end: Date | null;
  location: string;
  town?: string;
  sourceUrl?: string;
  cancelled?: boolean;
}

function escapeCalendarText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function localCalendarDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LOCAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return `${get("year")}${get("month")}${get("day")}T${get("hour")}${get("minute")}${get("second")}`;
}

function utcCalendarDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

const encoder = new TextEncoder();

/** RFC 5545 §3.1: lines longer than 75 octets continue with CRLF + space. */
function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    // Continuation lines spend one octet on the leading space.
    const limit = chunks.length === 0 ? 75 : 74;
    if (currentBytes + bytes > limit) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += bytes;
  }
  chunks.push(current);
  return chunks.join("\r\n ");
}

function eventLines(event: CalendarEventInput, generatedAt: Date): string[] {
  const end = event.end ?? new Date(event.start.getTime() + 60 * 60 * 1000);
  const description = [event.description, event.sourceUrl ? `Source: ${event.sourceUrl}` : ""]
    .filter(Boolean)
    .join("\n\n");
  return [
    "BEGIN:VEVENT",
    `UID:${escapeCalendarText(`${event.id}@westfieldbuzz.com`)}`,
    `DTSTAMP:${utcCalendarDate(generatedAt)}`,
    `DTSTART;TZID=${LOCAL_TIME_ZONE}:${localCalendarDate(event.start)}`,
    `DTEND;TZID=${LOCAL_TIME_ZONE}:${localCalendarDate(end)}`,
    `SUMMARY:${escapeCalendarText(event.title)}`,
    `LOCATION:${escapeCalendarText([event.location, event.town].filter(Boolean).join(", "))}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    `URL:${SITE_ORIGIN}/events/${encodeURIComponent(event.id)}`,
    ...(event.cancelled ? ["STATUS:CANCELLED"] : []),
    "END:VEVENT",
  ];
}

/**
 * One VCALENDAR holding the given events. With a `name`, it carries the
 * subscription hints calendar apps use for a feed.
 */
export function buildCalendar(
  events: CalendarEventInput[],
  options: { name?: string; generatedAt?: Date } = {},
): string {
  const generatedAt = options.generatedAt ?? new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Westfield Buzz//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...(options.name
      ? [
          `X-WR-CALNAME:${escapeCalendarText(options.name)}`,
          `X-WR-TIMEZONE:${LOCAL_TIME_ZONE}`,
          "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
          "X-PUBLISHED-TTL:PT6H",
        ]
      : []),
    ...events.flatMap((event) => eventLines(event, generatedAt)),
    "END:VCALENDAR",
  ];
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
