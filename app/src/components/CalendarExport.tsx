import type { Event } from "@/lib/firestore";
import { buildCalendar } from "@/lib/events/ical";

function toDate(value: Event["date"] | Event["endDate"]): Date | null {
  if (!value) return null;
  return value.toDate ? value.toDate() : new Date(value as unknown as string);
}

export function buildCalendarFile(event: Event, generatedAt = new Date()): string {
  return buildCalendar([{
    id: event.id,
    title: event.title,
    description: event.description,
    start: toDate(event.date) ?? generatedAt,
    end: toDate(event.endDate),
    location: event.location,
    town: event.town,
    sourceUrl: event.sourceUrl,
    cancelled: event.status === "cancelled",
  }], { generatedAt });
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
