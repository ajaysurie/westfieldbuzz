"use client";

import { useMemo } from "react";
import type { Event } from "@/lib/firestore";

interface EventCalendarProps {
  events: Event[];
  onSelectDate: (date: string) => void;
  selectedDate: string | null;
}

export default function EventCalendar({ events, onSelectDate, selectedDate }: EventCalendarProps) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const eventDates = useMemo(() => {
    const dates = new Set<string>();
    for (const evt of events) {
      const d = evt.date?.toDate ? evt.date.toDate() : new Date(evt.date as unknown as string);
      dates.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }
    return dates;
  }, [events]);

  const monthName = new Date(year, month).toLocaleString("en-US", { month: "long", year: "numeric" });
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const cells = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`empty-${i}`} />);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${month}-${day}`;
    const hasEvent = eventDates.has(dateKey);
    const isSelected = selectedDate === dateKey;
    const isToday = day === now.getDate();

    cells.push(
      <button
        key={day}
        onClick={() => onSelectDate(dateKey)}
        className={`relative flex h-10 w-full items-center justify-center rounded-lg text-[0.85rem] transition-all ${
          isSelected
            ? "bg-accent text-white font-semibold"
            : isToday
              ? "bg-accent/10 text-accent font-semibold"
              : "text-ink-light hover:bg-paper-dark"
        }`}
      >
        {day}
        {hasEvent && !isSelected && (
          <span
            className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full"
            style={{ background: "var(--accent)" }}
          />
        )}
      </button>
    );
  }

  return (
    <div className="rounded-[10px] border border-black/6 bg-paper-pure p-6">
      <h3
        className="mb-4 text-center text-[1.1rem]"
        style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
      >
        {monthName}
      </h3>
      <div className="grid grid-cols-7 gap-1">
        {dayNames.map((d) => (
          <div key={d} className="pb-2 text-center text-[0.7rem] font-semibold uppercase tracking-wider text-ink-muted">
            {d}
          </div>
        ))}
        {cells}
      </div>
    </div>
  );
}
