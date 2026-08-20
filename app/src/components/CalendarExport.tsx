import type { Event } from "@/lib/firestore";

const LOCAL_TIME_ZONE = "America/New_York";

function toDate(value: Event["date"] | Event["endDate"]): Date | null {
  if (!value) return null;
  return value.toDate ? value.toDate() : new Date(value as unknown as string);
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

export function buildCalendarFile(event: Event, generatedAt = new Date()): string {
  const start = toDate(event.date) ?? generatedAt;
  const end = toDate(event.endDate) ?? new Date(start.getTime() + 60 * 60 * 1000);
  const description = [event.description, event.sourceUrl ? `Source: ${event.sourceUrl}` : ""]
    .filter(Boolean)
    .join("\n\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Westfield Buzz//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeCalendarText(`${event.id}@westfieldbuzz.com`)}`,
    `DTSTAMP:${utcCalendarDate(generatedAt)}`,
    `DTSTART;TZID=${LOCAL_TIME_ZONE}:${localCalendarDate(start)}`,
    `DTEND;TZID=${LOCAL_TIME_ZONE}:${localCalendarDate(end)}`,
    `SUMMARY:${escapeCalendarText(event.title)}`,
    `LOCATION:${escapeCalendarText([event.location, event.town].filter(Boolean).join(", "))}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    `URL:https://westfieldbuzz.com/events/${encodeURIComponent(event.id)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export default function CalendarExport({ event }: { event: Event }) {
  const calendar = buildCalendarFile(event);
  const href = `data:text/calendar;charset=utf-8,${encodeURIComponent(calendar)}`;

  return (
    <a
      href={href}
      download={`${event.id}.ics`}
      className="detail-action"
      aria-label={`Add ${event.title} to your calendar`}
    >
      Add to calendar
    </a>
  );
}
