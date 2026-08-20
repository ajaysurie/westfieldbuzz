"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import EventCard from "@/components/EventCard";
import { FridaySignup } from "@/components/FridaySignup";
import { localDateKey } from "@/components/EventCalendar";
import { getEvents, type Event } from "@/lib/firestore";

const SEARCH_STARTERS = [
  "Rainy-day ideas for kids",
  "Free this weekend",
  "A low-key date night",
];

function eventDate(event: Event): Date {
  return event.date?.toDate
    ? event.date.toDate()
    : new Date(event.date as unknown as string);
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function dateHeading(key: string): string {
  return new Date(`${key}T12:00:00-04:00`).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function Home() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setEvents(await getEvents());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const weekGroups = useMemo(() => {
    const start = startOfToday();
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const upcoming = events
      .filter((event) => {
        const date = eventDate(event);
        return event.publicationStatus === "published" && date >= start && date < end;
      })
      .sort((left, right) => eventDate(left).getTime() - eventDate(right).getTime());

    const groups = new Map<string, Event[]>();
    for (const event of upcoming) {
      const key = localDateKey(eventDate(event));
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }
    return Array.from(groups.entries()).slice(0, 4);
  }, [events]);

  const weekLabel = startOfToday().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <>
      <section className="home-hero">
        <div className="home-shell">
          <p className="dateline">Westfield + nearby · Week of {weekLabel}</p>
          <div className="home-hero__content">
            <img
              className="home-hero__art"
              src="/event-cats/westfield-hero.png"
              alt="Watercolor illustration of downtown Westfield"
            />
            <div className="home-hero__copy">
              <p className="eyebrow">Freshly checked local events</p>
              <h1>What&apos;s on around Westfield <em>this week.</em></h1>
              <p className="home-hero__lede">
                From the library to downtown, plus nearby picks worth the drive. Search by
                who&apos;s going, when you&apos;re free, or what sounds good.
              </p>
              <form action="/search" method="get" className="event-search-form">
                <label htmlFor="home-search" className="sr-only">Search local events</label>
                <input
                  id="home-search"
                  name="q"
                  type="search"
                  placeholder="Something indoors Saturday for my 7-year-old"
                  minLength={2}
                  required
                />
                <button type="submit" aria-label="Search local events">
                  <span aria-hidden="true">→</span>
                </button>
              </form>
              <div className="search-starters" aria-label="Suggested searches">
                {SEARCH_STARTERS.map((query) => (
                  <Link key={query} href={`/search?q=${encodeURIComponent(query)}`}>
                    {query}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="week-preview" aria-labelledby="week-heading">
        <div className="home-shell">
          <div className="section-heading">
            <div>
              <p className="eyebrow">The local agenda</p>
              <h2 id="week-heading">This week, in order</h2>
            </div>
            <Link href="/events">Open the full calendar <span aria-hidden="true">→</span></Link>
          </div>

          {loading ? (
            <div className="state-panel" role="status" aria-live="polite">
              <span className="state-panel__mark" aria-hidden="true">•••</span>
              <h3>Checking this week&apos;s calendars</h3>
              <p>We&apos;re loading the latest published event details.</p>
            </div>
          ) : error ? (
            <div className="state-panel state-panel--error" role="alert">
              <span className="state-panel__mark" aria-hidden="true">!</span>
              <h3>We couldn&apos;t check the calendar</h3>
              <p>The source data did not load. Try again without losing your place.</p>
              <button type="button" onClick={() => void loadEvents()}>Try again</button>
            </div>
          ) : weekGroups.length === 0 ? (
            <div className="state-panel">
              <span className="state-panel__mark" aria-hidden="true">◇</span>
              <h3>This week is still taking shape</h3>
              <p>No published events are on the board yet. Check the full calendar for later dates.</p>
              <Link href="/events">Browse the calendar</Link>
            </div>
          ) : (
            <div className="agenda-groups">
              {weekGroups.map(([date, dayEvents]) => (
                <section key={date} className="agenda-day" aria-labelledby={`day-${date}`}>
                  <h3 id={`day-${date}`}>{dateHeading(date)}</h3>
                  <div className="agenda-day__events">
                    {dayEvents.map((event) => <EventCard key={event.id} event={event} />)}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </section>

      <section id="friday-list" className="friday-section" aria-labelledby="friday-heading">
        <div className="home-shell friday-strip">
          <div>
            <p className="eyebrow">A calmer Friday ritual</p>
            <h2 id="friday-heading">The good stuff, before the weekend starts.</h2>
            <p>One concise local list, checked and arranged for the days ahead.</p>
          </div>
          <FridaySignup />
        </div>
      </section>
    </>
  );
}
