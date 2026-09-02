"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Timestamp } from "firebase/firestore";
import EventCard from "@/components/EventCard";
import { FridaySignup } from "@/components/FridaySignup";
import { localDateKey } from "@/components/EventCalendar";
import type { Event } from "@/lib/firestore";
import HomeSearch from "@/components/search/HomeSearch";

export type SerializedHomeEvent = Pick<Event,
  "id" | "title" | "description" | "location" | "town" | "category" |
  "interestedCount" | "createdBy" | "imageUrl" | "status" | "availability" |
  "publicationStatus" | "freshnessStatus"
> & {
  date: string;
  endDate: string | null;
  createdAt: string;
  lastVerifiedAt?: string;
};

const timestamp = (value: string | null | undefined) => value
  ? { toDate: () => new Date(value) } as Timestamp
  : null;

function hydrateEvent(event: SerializedHomeEvent): Event {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    town: event.town,
    category: event.category,
    interestedCount: event.interestedCount,
    createdBy: event.createdBy,
    imageUrl: event.imageUrl,
    status: event.status,
    availability: event.availability,
    publicationStatus: event.publicationStatus,
    freshnessStatus: event.freshnessStatus,
    date: timestamp(event.date)!,
    endDate: timestamp(event.endDate),
    createdAt: timestamp(event.createdAt)!,
    ...(event.lastVerifiedAt ? { lastVerifiedAt: timestamp(event.lastVerifiedAt)! } : {}),
  };
}

function startOfToday() { const date = new Date(); date.setHours(0, 0, 0, 0); return date; }
function eventDate(event: Event) { return event.date.toDate(); }
function dateHeading(key: string) {
  return new Date(`${key}T12:00:00-04:00`).toLocaleDateString("en-US", {
    timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric",
  });
}

const SEARCH_STARTERS = ["Rainy-day ideas for kids", "Free this weekend", "A low-key date night"];

export default function HomeContent({ initialEvents }: { initialEvents: SerializedHomeEvent[] }) {
  const events = useMemo(() => initialEvents.map(hydrateEvent), [initialEvents]);
  const weekGroups = useMemo(() => {
    const groups = new Map<string, Event[]>();
    for (const event of events) {
      const key = localDateKey(eventDate(event));
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }
    return Array.from(groups.entries()).slice(0, 4);
  }, [events]);
  const weekLabel = startOfToday().toLocaleDateString("en-US", {
    timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric",
  });

  return <>
    <section className="home-hero"><div className="home-shell">
      <p className="dateline">Westfield + nearby · Week of {weekLabel}</p>
      <div className="home-hero__content">
        <img className="home-hero__art" src="/event-cats/westfield-hero.png" alt="Watercolor illustration of downtown Westfield" />
        <div className="home-hero__copy">
          <p className="eyebrow">Local events</p>
          <h1>What&apos;s on around Westfield <em>this week.</em></h1>
          <p className="home-hero__lede">Events at the library, downtown, and in nearby towns. Search by who&apos;s going, when you&apos;re free, or what you want to do.</p>
          <HomeSearch starters={SEARCH_STARTERS} />
        </div>
      </div>
    </div></section>
    <section className="week-preview" aria-labelledby="week-heading"><div className="home-shell">
      <div className="section-heading"><div><p className="eyebrow">The local agenda</p><h2 id="week-heading">This week, in order</h2></div>
        <Link href="/events">Open the full calendar <span aria-hidden="true">→</span></Link></div>
      {weekGroups.length === 0 ? <div className="state-panel"><span className="state-panel__mark" aria-hidden="true">◇</span>
        <h3>No events listed this week</h3><p>See the full calendar for events later this month.</p><Link href="/events">Browse the calendar</Link></div>
      : <div className="agenda-groups">{weekGroups.map(([date, dayEvents]) => <section key={date} className="agenda-day" aria-labelledby={`day-${date}`}>
        <h3 id={`day-${date}`}>{dateHeading(date)}</h3><div className="agenda-day__events">{dayEvents.map((event) => <EventCard key={event.id} event={event} />)}</div>
      </section>)}</div>}
    </div></section>
    <section id="friday-list" className="friday-section" aria-labelledby="friday-heading"><div className="home-shell friday-strip">
      <div><p className="eyebrow">Friday email</p><h2 id="friday-heading">Plan your weekend.</h2><p>Get a short list of local events every Friday.</p></div><FridaySignup />
    </div></section>
  </>;
}
