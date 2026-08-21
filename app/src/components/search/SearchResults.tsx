"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { EventSearchSuccess } from "@/lib/search/search-contract";
import type { SearchableEvent } from "@/lib/search/event-retrieval";

const CATEGORY_IMAGES: Record<string, string> = {
  "Family & Kids": "/event-cats/family.png",
  "Arts & Culture": "/event-cats/arts.png",
  "Sports & Recreation": "/event-cats/sports.png",
  Music: "/event-cats/music.png",
  "Food & Drink": "/event-cats/food.png",
  Community: "/event-cats/community.png",
  "Health & Wellness": "/event-cats/health.png",
  Entertainment: "/event-cats/entertainment.png",
  History: "/event-cats/history.png",
  Markets: "/event-cats/market.png",
};

/** "SAT 10:30 AM" — the overlay badge; the full date lives on the event page. */
function badgeLabel(event: SearchableEvent): string {
  const start = new Date(event.date);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(start).toUpperCase();
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(start);
  return `${weekday} ${time}`;
}

/** Cost text for the meta line. Free events skip this — the FREE badge
 * already says so, so repeating it in the meta line would be redundant. */
function costMetaLabel(event: SearchableEvent): string | null {
  if (event.isFree) return null;
  if (event.costAmount == null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Number.isInteger(event.costAmount) ? 0 : 2,
  }).format(event.costAmount);
}

function ResultCard({ event, reason }: { event: SearchableEvent; reason: string }) {
  const hasPhoto = typeof event.imageUrl === "string" && /^https?:\/\//i.test(event.imageUrl);
  const metaParts = [
    event.location,
    event.town,
    costMetaLabel(event),
    event.driveMinutes != null ? `${event.driveMinutes} min drive` : null,
  ].filter(Boolean);

  return (
    <Link href={`/events/${encodeURIComponent(event.id)}`} aria-label={`View ${event.title}`} className="search-card">
      <div className="search-card__photo-wrap">
        {hasPhoto ? (
          // Real source photos come from many venue CDNs, so a plain lazy img
          // avoids allowlisting every host in next/image; the category
          // illustration stays the fallback when no photo is provided.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.imageUrl}
            alt=""
            loading="lazy"
            className="search-card__photo"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <Image
            src={CATEGORY_IMAGES[event.category] ?? "/event-cats/community.png"}
            alt=""
            fill
            className="search-card__photo"
            sizes="(max-width: 760px) 250px, 300px"
          />
        )}
        <span className="search-card__badge">● {badgeLabel(event)}</span>
        {event.isFree ? <span className="search-card__free">FREE</span> : null}
      </div>
      <div className="search-card__body">
        <div className="search-card__title">{event.title}</div>
        <div className="search-card__meta">{metaParts.join(" · ")}</div>
        <p className="search-card__reason">{reason}</p>
      </div>
    </Link>
  );
}

export default function SearchResults({ result }: { result: EventSearchSuccess }) {
  const [expanded, setExpanded] = useState(false);

  if (!result.results.length) {
    return (
      <section className="rounded-2xl border border-black/8 bg-paper-pure px-6 py-10 text-center shadow-sm">
        <h2 className="font-[family-name:var(--font-display)] text-3xl text-ink">No exact matches yet</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-ink-light">The inventory has no event that safely meets every interpreted constraint. Nothing has been invented to fill the gap.</p>
        <ul className="mx-auto mt-5 grid max-w-md gap-2 text-left text-sm text-ink-light">
          {result.suggestions.map((suggestion) => <li key={suggestion}>• {suggestion}</li>)}
        </ul>
        <Link href="/events" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-bold text-white no-underline">Browse the calendar</Link>
      </section>
    );
  }

  const top = result.results.slice(0, 3);
  const rest = result.results.slice(3);

  return (
    <div className="grid gap-3">
      {result.narrative?.length ? (
        <p className="search-narrative">
          {result.narrative.map((segment, index) =>
            segment.eventId ? (
              <Link key={index} href={`/events/${encodeURIComponent(segment.eventId)}`}>
                {segment.text}
              </Link>
            ) : (
              <span key={index}>{segment.text}</span>
            )
          )}
        </p>
      ) : null}

      <span className="search-kicker">Top picks</span>

      <div className="search-toppicks">
        {top.map(({ event, reason }) => (
          <ResultCard key={event.id} event={event} reason={reason} />
        ))}
        {rest.length > 0 && (
          <button
            type="button"
            className="search-more-tile"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            <span className="search-more-tile__count">{expanded ? "−" : `+${rest.length}`}</span>
            <span className="search-more-tile__label">{expanded ? "Show fewer" : "more this weekend"}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" style={{ transform: expanded ? "rotate(90deg)" : undefined }}>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        )}
      </div>

      {expanded && rest.length > 0 && (
        <div className="search-expanded-grid">
          {rest.map(({ event, reason }) => (
            <ResultCard key={event.id} event={event} reason={reason} />
          ))}
        </div>
      )}
    </div>
  );
}
