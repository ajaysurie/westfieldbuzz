"use client";

import { useEffect, useMemo, useState } from "react";
import { getEvents, type Event } from "@/lib/firestore";
import EventCard from "@/components/EventCard";
import EventCalendar from "@/components/EventCalendar";
import InterestedButton from "@/components/InterestedButton";
import { EVENT_CATEGORY_COLORS } from "@/lib/event-categories";

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const data = await getEvents();
      setEvents(data);
      setLoading(false);
    }
    load();
  }, []);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const evt of events) {
      if (evt.category) cats.add(evt.category);
    }
    return Array.from(cats).sort();
  }, [events]);

  const filteredEvents = (() => {
    let result = events;

    // Category filter (applies in both views)
    if (activeCategory) {
      result = result.filter((evt) => evt.category === activeCategory);
    }

    // Calendar view: filter by date/month
    if (view === "calendar") {
      if (selectedDate) {
        result = result.filter((evt) => {
          const d = evt.date?.toDate ? evt.date.toDate() : new Date(evt.date as unknown as string);
          return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === selectedDate;
        });
      } else {
        result = result.filter((evt) => {
          const d = evt.date?.toDate ? evt.date.toDate() : new Date(evt.date as unknown as string);
          return d.getMonth() === viewMonth && d.getFullYear() === viewYear;
        });
      }
    }

    return result;
  })();

  return (
    <div className="mx-auto max-w-[1100px] px-12 py-12 max-md:px-6">
      <div
        className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.15em]"
        style={{ color: "var(--accent)" }}
      >
        Events
      </div>
      <div className="mb-8 flex items-center justify-between">
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)",
            fontWeight: 400,
            color: "var(--ink)",
          }}
        >
          Upcoming in Westfield
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setView("list"); setSelectedDate(null); }}
            className={`rounded-full border px-4 py-1.5 text-[0.8rem] font-medium transition-all ${
              view === "list"
                ? "border-accent bg-accent/10 text-accent"
                : "border-black/10 text-ink-light hover:border-accent"
            }`}
          >
            List
          </button>
          <button
            onClick={() => setView("calendar")}
            className={`rounded-full border px-4 py-1.5 text-[0.8rem] font-medium transition-all ${
              view === "calendar"
                ? "border-accent bg-accent/10 text-accent"
                : "border-black/10 text-ink-light hover:border-accent"
            }`}
          >
            Calendar
          </button>
        </div>
      </div>

      {/* Category filters */}
      {!loading && categories.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory(null)}
            className={`rounded-full border px-3.5 py-1.5 text-[0.78rem] font-medium transition-all ${
              !activeCategory
                ? "border-accent bg-accent/10 text-accent"
                : "border-black/10 text-ink-light hover:border-accent"
            }`}
          >
            All
          </button>
          {categories.map((cat) => {
            const colors = EVENT_CATEGORY_COLORS[cat];
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(isActive ? null : cat)}
                className="rounded-full border px-3.5 py-1.5 text-[0.78rem] font-medium transition-all"
                style={
                  isActive && colors
                    ? { background: colors.bg, color: colors.text, borderColor: colors.text + "40" }
                    : { borderColor: "rgba(0,0,0,0.1)", color: "var(--ink-light)" }
                }
              >
                {cat}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <p className="py-12 text-center text-ink-muted">Loading events...</p>
      ) : (
        <>
          {view === "calendar" && (
            <div className="mb-8">
              <EventCalendar
                events={events}
                onSelectDate={(date) => {
                  setSelectedDate(selectedDate === date ? null : date);
                }}
                selectedDate={selectedDate}
                viewMonth={viewMonth}
                viewYear={viewYear}
                onMonthChange={(m, y) => {
                  setViewMonth(m);
                  setViewYear(y);
                  setSelectedDate(null);
                }}
              />
            </div>
          )}

          {filteredEvents.length === 0 ? (
            <p className="py-12 text-center text-ink-muted">
              {view === "calendar" && selectedDate
                ? "No events on this day."
                : view === "calendar"
                  ? "No events this month."
                  : "No upcoming events yet."}
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {filteredEvents.map((evt) => (
                <div key={evt.id} className="flex items-start gap-4">
                  <div className="flex-1">
                    <EventCard event={evt} />
                  </div>
                  <div className="shrink-0 pt-6">
                    <InterestedButton eventId={evt.id} initialCount={evt.interestedCount} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
