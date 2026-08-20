import Image from "next/image";
import Link from "next/link";
import type { Timestamp } from "firebase/firestore";
import type { Event } from "@/lib/firestore";
import { EVENT_CATEGORY_COLORS as CATEGORY_COLORS } from "@/lib/event-categories";
import EventStatusBadge from "@/components/EventStatusBadge";

const CATEGORY_IMAGES: Record<string, string> = {
  "Sports & Recreation": "/event-cats/sports.png",
  Sports: "/event-cats/sports.png",
  "Food & Drink": "/event-cats/food.png",
  "Family & Kids": "/event-cats/family.png",
  Family: "/event-cats/family.png",
  "Arts & Culture": "/event-cats/arts.png",
  Arts: "/event-cats/arts.png",
  Music: "/event-cats/music.png",
  Community: "/event-cats/community.png",
  "Health & Wellness": "/event-cats/health.png",
  Health: "/event-cats/health.png",
  Entertainment: "/event-cats/entertainment.png",
  History: "/event-cats/history.png",
  Markets: "/event-cats/market.png",
  Market: "/event-cats/market.png",
};

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

function verifiedLabel(timestamp: Timestamp | undefined): string {
  const date = toDate(timestamp);
  if (!date) return "Source verification pending";
  return `Verified ${date.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  })}`;
}

interface EventCardProps {
  event: Event;
  dark?: boolean;
  showInterested?: boolean;
}

export default function EventCard({ event, dark = false }: EventCardProps) {
  const startTime = formatEventTime(event.date);
  const endTime = formatEventTime(event.endDate);
  const timeRange = endTime ? `${startTime}\u2013${endTime}` : startTime;
  const categoryImage = CATEGORY_IMAGES[event.category] ?? "/event-cats/community.png";
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
          <Image src={categoryImage} alt="" fill sizes="(max-width: 760px) 104px, 154px" />
        )}
      </Link>
      <div className="event-card__body">
        <div className="event-card__topline">
          <EventStatusBadge
            status={event.status}
            availability={event.availability}
            freshness={event.freshnessStatus}
            compact
          />
          {event.category && (
            <span
              className="event-card__category"
              style={{
                background: CATEGORY_COLORS[event.category]?.bg || "#e8eef2",
                color: CATEGORY_COLORS[event.category]?.text || "#31506b",
              }}
            >
              {event.category}
            </span>
          )}
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
          {event.town ? ` · ${event.town}` : ""}
        </p>
        {event.description && <p className="event-card__description">{event.description}</p>}
        <div className="event-card__footer">
          <span>{verifiedLabel(event.lastVerifiedAt)}</span>
          <Link href={`/events/${encodeURIComponent(event.id)}`}>Event details <span aria-hidden="true">→</span></Link>
        </div>
      </div>
    </article>
  );
}
