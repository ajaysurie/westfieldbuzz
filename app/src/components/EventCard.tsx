import Link from "next/link";
import type { Timestamp } from "firebase/firestore";
import type { Event } from "@/lib/firestore";
import { EVENT_CATEGORY_COLORS as CATEGORY_COLORS } from "@/lib/event-categories";
import EventStatusBadge, { hasNoteworthyStatus } from "@/components/EventStatusBadge";
import { formatTimeRange, townSuffix } from "@/lib/events/display-text";

function toDate(timestamp: Timestamp | null | undefined): Date | null {
  if (!timestamp) return null;
  return timestamp.toDate ? timestamp.toDate() : new Date(timestamp as unknown as string);
}

export function formatEventDate(timestamp: Timestamp | null): string {
  const date = toDate(timestamp);
  if (!date) return "Date to be confirmed";
  return date.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatEventTime(timestamp: Timestamp | null): string {
  const date = toDate(timestamp);
  if (!date) return "";
  return date.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
}

function mapsUrl(event: Event) {
  const destination = [event.location, event.town || "Westfield", "NJ"]
    .filter(Boolean)
    .join(", ");
  return `https://maps.google.com/?q=${encodeURIComponent(destination)}`;
}

interface EventCardProps {
  event: Event;
  dark?: boolean;
  showInterested?: boolean;
  recurrenceLabel?: string;
  saved?: boolean;
}

export default function EventCard({ event, dark = false, recurrenceLabel, saved = false }: EventCardProps) {
  const startTime = formatEventTime(event.date);
  const endTime = formatEventTime(event.endDate);
  const timeRange = formatTimeRange(startTime, endTime);
  const town = townSuffix(event.location, event.town);
  const categoryColors = CATEGORY_COLORS[event.category] ?? { bg: "#e8eef2", text: "#31506b" };
  const statusProps = { status: event.status, availability: event.availability, freshness: event.freshnessStatus };
  const hasPhoto = typeof event.imageUrl === "string" && /^https?:\/\//i.test(event.imageUrl);

  return (
    <article className={`event-card${dark ? " event-card--dark" : ""}`}>
      <Link
        href={`/events/${encodeURIComponent(event.id)}`}
        className="event-card__art"
        aria-label={`View ${event.title}`}
      >
        {hasPhoto ? (
          // Real source photos come from many venue CDNs, so a plain lazy img
          // avoids allowlisting every host in next/image; the category
          // illustration stays the fallback when no photo is provided.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.imageUrl}
            alt=""
            loading="lazy"
            className="event-card__photo"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          // Without a source photo, the art column shows the start time on the
          // category color instead of repeating one stock illustration.
          <span
            className="event-card__time-tile"
            style={{ background: categoryColors.bg, color: categoryColors.text }}
          >
            {startTime || "All day"}
          </span>
        )}
      </Link>
      <div className="event-card__body">
        <div className="event-card__topline">
          <span className="event-card__chips">
            {hasNoteworthyStatus(statusProps) && <EventStatusBadge {...statusProps} compact />}
            {event.category && (
              <span
                className="event-card__category"
                style={{ background: categoryColors.bg, color: categoryColors.text }}
              >
                {event.category}
              </span>
            )}
            {recurrenceLabel && (
              <span className="event-card__recurrence">↻ {recurrenceLabel}</span>
            )}
          </span>
        </div>
        <Link href={`/events/${encodeURIComponent(event.id)}`} className="event-card__title">
          {event.title}
        </Link>
        <p className="event-card__when">
          {formatEventDate(event.date)}{timeRange ? ` · ${timeRange}` : ""}
        </p>
        <p className="event-card__where">
          <a href={mapsUrl(event)} target="_blank" rel="noopener noreferrer">
            {event.location}
          </a>
          {town ? ` · ${town}` : ""}
        </p>
        {event.description && <p className="event-card__description">{event.description}</p>}
        <div className="event-card__footer">
          {saved
            ? <span className="event-card__saved">★ Saved · on your Friday list</span>
            : <span />}
          <Link href={`/events/${encodeURIComponent(event.id)}`}>Event details <span aria-hidden="true">→</span></Link>
        </div>
      </div>
    </article>
  );
}
