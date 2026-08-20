"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import EventCalendar, { localDateKey, moveCalendarMonth } from "@/components/EventCalendar";
import EventCard from "@/components/EventCard";
import { getEvents, type Event } from "@/lib/firestore";

type EventsView = "agenda" | "calendar";

function toDate(event: Event): Date {
  return event.date?.toDate
    ? event.date.toDate()
    : new Date(event.date as unknown as string);
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function readableDate(key: string): string {
  return new Date(`${key}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function monthFromParams(monthParam: string | null, dateParam: string | null) {
  const source = monthParam ?? dateParam?.slice(0, 7);
  if (source && /^\d{4}-\d{2}$/.test(source)) {
    const [year, month] = source.split("-").map(Number);
    if (month >= 1 && month <= 12) return { month: month - 1, year };
  }
  const today = new Date();
  return { month: today.getMonth(), year: today.getFullYear() };
}

function EventsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view: EventsView = searchParams.get("view") === "calendar" ? "calendar" : "agenda";
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get("date") ?? "")
    ? searchParams.get("date")
    : null;
  const activeCategory = searchParams.get("category");
  const visibleMonth = monthFromParams(searchParams.get("month"), selectedDate);

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const updateParams = useCallback((changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(changes).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    const query = next.toString();
    router.replace(query ? `/events?${query}` : "/events", { scroll: false });
  }, [router, searchParams]);

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

  const publicEvents = useMemo(() => {
    const today = startOfToday();
    return events
      .filter((event) => event.publicationStatus === "published" && toDate(event) >= today)
      .sort((left, right) => toDate(left).getTime() - toDate(right).getTime());
  }, [events]);

  const categories = useMemo(
    () => Array.from(new Set(publicEvents.map((event) => event.category).filter(Boolean))).sort(),
    [publicEvents]
  );

  const filteredEvents = useMemo(() => publicEvents.filter((event) => {
    if (activeCategory && event.category !== activeCategory) return false;
    const key = localDateKey(toDate(event));
    if (selectedDate) return key === selectedDate;
    if (view === "calendar") {
      return toDate(event).getMonth() === visibleMonth.month &&
        toDate(event).getFullYear() === visibleMonth.year;
    }
    return true;
  }), [activeCategory, publicEvents, selectedDate, view, visibleMonth.month, visibleMonth.year]);

  const agendaGroups = useMemo(() => {
    const groups = new Map<string, Event[]>();
    for (const event of filteredEvents) {
      const key = localDateKey(toDate(event));
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }
    return Array.from(groups.entries());
  }, [filteredEvents]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = startOfToday();
    date.setDate(date.getDate() + index);
    return date;
  }), []);

  function setView(nextView: EventsView) {
    updateParams({ view: nextView === "agenda" ? null : nextView });
  }

  function changeMonth(month: number, year: number) {
    updateParams({ month: `${year}-${String(month + 1).padStart(2, "0")}`, date: null });
  }

  function moveFocus(direction: -1 | 1) {
    if (view === "calendar" && !selectedDate) {
      const next = moveCalendarMonth(visibleMonth.month, visibleMonth.year, direction);
      changeMonth(next.month, next.year);
      return;
    }
    const source = selectedDate ? new Date(`${selectedDate}T12:00:00`) : startOfToday();
    source.setDate(source.getDate() + direction);
    updateParams({ date: localDateKey(source), month: null });
  }

  function chooseToday() {
    const today = new Date();
    updateParams({ date: localDateKey(today), month: null });
  }

  const hasFilters = Boolean(activeCategory || selectedDate);

  return (
    <>
      <header className="events-header">
        <div className="events-shell events-header__inner">
          <div>
            <p className="eyebrow">Freshly checked around town</p>
            <h1>Plan what&apos;s next.</h1>
            <p>Browse the local agenda or choose a day on the full calendar.</p>
          </div>
          <img src="/header-events.png" alt="" aria-hidden="true" />
        </div>
      </header>

      <div className="events-shell events-workspace">
        <section className="events-toolbar" aria-label="Calendar controls">
          <div className="view-switch" role="group" aria-label="Event view">
            <button type="button" onClick={() => setView("agenda")} aria-pressed={view === "agenda"}>
              Agenda
            </button>
            <button type="button" onClick={() => setView("calendar")} aria-pressed={view === "calendar"}>
              Calendar
            </button>
          </div>
          <div className="date-nav">
            <button type="button" onClick={() => moveFocus(-1)} aria-label={view === "calendar" ? "Previous month or day" : "Previous day"}>←</button>
            <button type="button" onClick={chooseToday}>Today</button>
            <button type="button" onClick={() => moveFocus(1)} aria-label={view === "calendar" ? "Next month or day" : "Next day"}>→</button>
          </div>
        </section>

        <section className="week-strip" aria-label="Next seven days">
          {weekDays.map((day) => {
            const key = localDateKey(day);
            const isSelected = selectedDate === key;
            const count = publicEvents.filter((event) => localDateKey(toDate(event)) === key).length;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={isSelected}
                onClick={() => updateParams({ date: isSelected ? null : key, month: null })}
              >
                <span>{day.toLocaleDateString("en-US", { weekday: "short" })}</span>
                <strong>{day.getDate()}</strong>
                <small>{count ? `${count} event${count === 1 ? "" : "s"}` : "Open"}</small>
              </button>
            );
          })}
        </section>

        {!loading && categories.length > 0 && (
          <section className="category-filters" aria-label="Filter by category">
            <button type="button" aria-pressed={!activeCategory} onClick={() => updateParams({ category: null })}>All events</button>
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                aria-pressed={activeCategory === category}
                onClick={() => updateParams({ category: activeCategory === category ? null : category })}
              >
                {category}
              </button>
            ))}
          </section>
        )}

        {view === "calendar" && !loading && !error && (
          <EventCalendar
            events={publicEvents}
            selectedDate={selectedDate}
            viewMonth={visibleMonth.month}
            viewYear={visibleMonth.year}
            onSelectDate={(date) => updateParams({ date: selectedDate === date ? null : date, month: null })}
            onMonthChange={changeMonth}
          />
        )}

        <section className="events-results" aria-labelledby="events-results-heading">
          <div className="events-results__heading">
            <div>
              <p className="eyebrow">{view === "calendar" ? "Calendar selection" : "Chronological agenda"}</p>
              <h2 id="events-results-heading">
                {selectedDate ? readableDate(selectedDate) : view === "calendar" ? "This month" : "Upcoming events"}
              </h2>
            </div>
            {!loading && !error && <span>{filteredEvents.length} shown</span>}
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
              <h3>The calendar did not load</h3>
              <p>This is a loading problem, not an empty week. Try the request again.</p>
              <button type="button" onClick={() => void loadEvents()}>Try again</button>
            </div>
          ) : publicEvents.length === 0 ? (
            <div className="state-panel">
              <span className="state-panel__mark" aria-hidden="true">◇</span>
              <h3>No published events yet</h3>
              <p>The local calendar is still being assembled. Nothing is wrong with your filters.</p>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="state-panel">
              <span className="state-panel__mark" aria-hidden="true">◇</span>
              <h3>{selectedDate ? `No events on ${readableDate(selectedDate)}` : "Nothing matches this view"}</h3>
              <p>Try a different day or clear the category filter.</p>
              {hasFilters && <button type="button" onClick={() => updateParams({ category: null, date: null })}>Clear filters</button>}
            </div>
          ) : (
            <div className="agenda-groups">
              {agendaGroups.map(([date, dayEvents]) => (
                <section key={date} className="agenda-day" aria-labelledby={`events-day-${date}`}>
                  <h3 id={`events-day-${date}`}>{readableDate(date)}</h3>
                  <div className="agenda-day__events">
                    {dayEvents.map((event) => <EventCard key={event.id} event={event} />)}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>

        <p className="events-source-note">
          Every event links back to its source and shows when it was last checked. Looking for something specific? <Link href="/search">Describe it in a sentence.</Link>
        </p>
      </div>
    </>
  );
}

export default function EventsPage() {
  return (
    <Suspense fallback={<div className="events-shell state-panel" role="status">Loading calendar controls…</div>}>
      <EventsContent />
    </Suspense>
  );
}
