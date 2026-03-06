"use client";

import { useEffect, useState } from "react";
import { getEvents, type Event } from "@/lib/firestore";
import EventCard from "@/components/EventCard";
import EventCalendar from "@/components/EventCalendar";
import InterestedButton from "@/components/InterestedButton";

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const data = await getEvents();
      setEvents(data);
      setLoading(false);
    }
    load();
  }, []);

  const eventsForDate = selectedDate
    ? events.filter((evt) => {
        const d = evt.date?.toDate ? evt.date.toDate() : new Date(evt.date as unknown as string);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === selectedDate;
      })
    : events;

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

      {loading ? (
        <p className="py-12 text-center text-ink-muted">Loading events...</p>
      ) : (
        <>
          {view === "calendar" && (
            <div className="mb-8">
              <EventCalendar
                events={events}
                onSelectDate={setSelectedDate}
                selectedDate={selectedDate}
              />
            </div>
          )}

          {(view === "calendar" && selectedDate && eventsForDate.length === 0) && (
            <p className="mb-6 text-[0.9rem] text-ink-muted">No events on this day.</p>
          )}

          {eventsForDate.length === 0 && view === "list" ? (
            <p className="py-12 text-center text-ink-muted">No upcoming events yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {eventsForDate.map((evt) => (
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
