"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import EventCard from "@/components/EventCard";
import { localDateKey } from "@/components/EventCalendar";
import WeatherBanner from "@/components/WeatherBanner";
import { FridaySignup } from "@/components/FridaySignup";
import { getPublicEvents, type Event } from "@/lib/firestore";
import { detectWeeklyRecurrence } from "@/lib/events/recurrence";
import { weekendWindow } from "@/lib/events/weekend";
import { useAuth } from "@/lib/auth";
import { useSavedEventIds } from "@/lib/personalization";

function toDate(event: Event): Date {
  return event.date?.toDate
    ? event.date.toDate()
    : new Date(event.date as unknown as string);
}

function dayHeading(key: string): string {
  return new Date(`${key}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function WeekendPage() {
  const window = useMemo(() => weekendWindow(new Date()), []);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { user } = useAuth();
  const savedIds = useSavedEventIds(user?.uid);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setEvents(await getPublicEvents({ from: window.from, to: window.to, limit: 80 }));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [window.from, window.to]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const dayGroups = useMemo(() => {
    const groups = new Map<string, Event[]>();
    for (const event of events) {
      const key = localDateKey(toDate(event));
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }
    return Array.from(groups.entries());
  }, [events]);

  const recurrenceLabels = useMemo(
    () => detectWeeklyRecurrence(events.map((event) => ({
      id: event.id,
      title: event.title,
      location: event.location,
      date: toDate(event),
    }))),
    [events]
  );

  return (
    <>
      <header className="events-header">
        <div className="events-shell events-header__inner">
          <div>
            <p className="eyebrow">Westfield + nearby · {window.label}</p>
            <h1>This weekend <em>around town.</em></h1>
            <p>Everything happening Friday through Sunday, in order.</p>
          </div>
          <img src="/header-events.png" alt="" aria-hidden="true" />
        </div>
      </header>

      <div className="events-shell events-workspace">
        <WeatherBanner startKey={window.startKey} endKey={window.endKey} />

        <section className="events-results" aria-labelledby="weekend-results-heading">
          <div className="events-results__heading">
            <div>
              <p className="eyebrow">Friday to Sunday</p>
              <h2 id="weekend-results-heading">The weekend, in order</h2>
            </div>
            {!loading && !error && <span>{events.length} event{events.length === 1 ? "" : "s"}</span>}
          </div>

          {loading ? (
            <div className="state-panel" role="status" aria-live="polite">
              <span className="state-panel__mark" aria-hidden="true">•••</span>
              <h3>Checking the latest event details</h3>
              <p>Loading published events and their current statuses.</p>
            </div>
          ) : error ? (
            <div className="state-panel state-panel--error" role="alert">
              <span className="state-panel__mark" aria-hidden="true">!</span>
              <h3>The weekend did not load</h3>
              <p>This is a loading problem, not an empty weekend. Try the request again.</p>
              <button type="button" onClick={() => void loadEvents()}>Try again</button>
            </div>
          ) : dayGroups.length === 0 ? (
            <div className="state-panel">
              <span className="state-panel__mark" aria-hidden="true">◇</span>
              <h3>Nothing listed for this weekend yet</h3>
              <p>The calendar may still be filling in. The full agenda covers further out.</p>
              <Link href="/events">Open the calendar</Link>
            </div>
          ) : (
            <div className="agenda-groups">
              {dayGroups.map(([date, dayEvents]) => (
                <section key={date} className="agenda-day" aria-labelledby={`weekend-day-${date}`}>
                  <h3 id={`weekend-day-${date}`}>{dayHeading(date)}</h3>
                  <div className="agenda-day__events">
                    {dayEvents.map((event) => (
                      <EventCard key={event.id} event={event} recurrenceLabel={recurrenceLabels.get(event.id)} saved={savedIds.has(event.id)} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>

        <p className="events-source-note">
          This is the same list that lands in your inbox Friday morning. <Link href="/events">Browse further ahead on the calendar</Link> or <Link href="/search">describe what you&apos;re in the mood for</Link>.
        </p>

        <section className="friday-strip weekend-signup" aria-label="Friday email signup">
          <div><p className="eyebrow">Friday email</p><h2>Get this list in your inbox.</h2><p>A short list of local events every Friday.</p></div>
          <FridaySignup />
        </section>
      </div>
    </>
  );
}
