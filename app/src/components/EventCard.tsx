import Image from "next/image";
import type { Event } from "@/lib/firestore";
import type { Timestamp } from "firebase/firestore";
import { EVENT_CATEGORY_COLORS as CATEGORY_COLORS } from "@/lib/event-categories";
import InterestedButton from "@/components/InterestedButton";

const CATEGORY_IMAGES: Record<string, string> = {
  Sports: "/event-cats/sports.png",
  "Food & Drink": "/event-cats/food.png",
  Family: "/event-cats/family.png",
  Arts: "/event-cats/arts.png",
  Music: "/event-cats/music.png",
  Community: "/event-cats/community.png",
  Health: "/event-cats/health.png",
  Entertainment: "/event-cats/entertainment.png",
  History: "/event-cats/history.png",
  Market: "/event-cats/market.png",
};

function formatDate(timestamp: Timestamp | null): string {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp as unknown as string);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatTime(timestamp: Timestamp | null): string {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp as unknown as string);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function mapsUrl(location: string) {
  return `https://maps.google.com/?q=${encodeURIComponent(location + ", Westfield, NJ")}`;
}

interface EventCardProps {
  event: Event;
  dark?: boolean;
  showInterested?: boolean;
}

export default function EventCard({ event, dark = false, showInterested = false }: EventCardProps) {
  const startTime = formatTime(event.date);
  const endTime = event.endDate ? formatTime(event.endDate) : "";
  const timeRange = endTime ? `${startTime}\u2013${endTime}` : startTime;

  if (dark) {
    return (
      <div className="cursor-pointer rounded-[10px] border border-white/8 p-6 transition-all hover:border-white/15 hover:bg-white/3">
        <div
          className="mb-2 text-[0.88rem]"
          style={{ fontFamily: "var(--font-display)", color: "var(--accent-light)" }}
        >
          {formatDate(event.date)}
        </div>
        <div
          className="mb-1.5 text-[1.25rem]"
          style={{ fontFamily: "var(--font-display)", color: "var(--paper)" }}
        >
          {event.title}
        </div>
        <div className="flex items-center gap-1.5 text-[0.85rem] text-white/40">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-60">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {event.location}
          {timeRange && ` \u00B7 ${timeRange}`}
        </div>
      </div>
    );
  }

  const categoryImage = CATEGORY_IMAGES[event.category];

  return (
    <div
      className="relative overflow-hidden rounded-[10px] border border-black/6 bg-paper-pure p-6 transition-all hover:shadow-md hover:-translate-y-0.5"
      style={{ borderTop: `3px solid ${CATEGORY_COLORS[event.category]?.text || 'var(--accent)'}` }}
    >
      {categoryImage && (
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 hidden w-[40%] md:block">
          <Image
            src={categoryImage}
            alt=""
            fill
            className="object-cover opacity-[0.08]"
            style={{ maskImage: "linear-gradient(to right, transparent, black 40%)" }}
            sizes="200px"
          />
        </div>
      )}
      <div className="relative mb-1.5 flex items-start justify-between gap-2">
        <div
          className="text-[0.88rem] font-semibold"
          style={{ color: "var(--accent)" }}
        >
          {formatDate(event.date)}
        </div>
        {event.category && (
          <span
            className="rounded-full px-2.5 py-0.5 text-[0.75rem] font-semibold"
            style={{
              background: CATEGORY_COLORS[event.category]?.bg || "#f1f5f9",
              color: CATEGORY_COLORS[event.category]?.text || "#475569",
            }}
          >
            {event.category}
          </span>
        )}
      </div>
      <h3
        className="mb-1.5 text-[1.15rem]"
        style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--ink)" }}
      >
        {event.title}
      </h3>
      <div className="flex items-center gap-1.5 text-[0.88rem] text-ink-muted">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-60">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <a
          href={mapsUrl(event.location)}
          target="_blank"
          rel="noopener noreferrer"
          className="no-underline text-ink-muted hover:text-accent hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {event.location}
        </a>
        {timeRange && <span> &middot; {timeRange}</span>}
      </div>
      {event.description && (
        <p className="mt-2 text-[0.9rem] text-ink-light line-clamp-2">
          {event.description}
        </p>
      )}
      {showInterested && (
        <div className="mt-4">
          <InterestedButton eventId={event.id} initialCount={event.interestedCount} />
        </div>
      )}
      {!showInterested && event.interestedCount > 0 && (
        <div className="mt-3 text-[0.84rem] text-ink-muted">
          {event.interestedCount} interested
        </div>
      )}
    </div>
  );
}
