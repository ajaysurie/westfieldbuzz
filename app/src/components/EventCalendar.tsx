"use client";

import { useMemo } from "react";
import type { Event } from "@/lib/firestore";

interface EventCalendarProps {
  events: Event[];
  onSelectDate: (date: string) => void;
  selectedDate: string | null;
  viewMonth: number;
  viewYear: number;
  onMonthChange: (month: number, year: number) => void;
}

export default function EventCalendar({
  events,
  onSelectDate,
  selectedDate,
  viewMonth,
  viewYear,
  onMonthChange,
}: EventCalendarProps) {
  const now = new Date();

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();

  const eventDates = useMemo(() => {
    const dates = new Set<string>();
    for (const evt of events) {
      const d = evt.date?.toDate ? evt.date.toDate() : new Date(evt.date as unknown as string);
      dates.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }
    return dates;
  }, [events]);

  const monthName = new Date(viewYear, viewMonth).toLocaleString("en-US", { month: "long", year: "numeric" });
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function goBack() {
    if (viewMonth === 0) {
      onMonthChange(11, viewYear - 1);
    } else {
      onMonthChange(viewMonth - 1, viewYear);
    }
  }

  function goForward() {
    if (viewMonth === 11) {
      onMonthChange(0, viewYear + 1);
    } else {
      onMonthChange(viewMonth + 1, viewYear);
    }
  }

  const cells = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`empty-${i}`} />);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${viewYear}-${viewMonth}-${day}`;
    const hasEvent = eventDates.has(dateKey);
    const isSelected = selectedDate === dateKey;
    const isToday = day === now.getDate() && viewMonth === now.getMonth() && viewYear === now.getFullYear();

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
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={goBack}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-paper-dark hover:text-ink"
        >
          &larr;
        </button>
        <h3
          className="text-[1.1rem]"
          style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
        >
          {monthName}
        </h3>
        <button
          onClick={goForward}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-paper-dark hover:text-ink"
        >
          &rarr;
        </button>
      </div>
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
