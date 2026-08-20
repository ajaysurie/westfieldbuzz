"use client";

import { useMemo } from "react";
import type { Event } from "@/lib/firestore";

const LOCAL_TIME_ZONE = "America/New_York";

export function localDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LOCAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function moveCalendarMonth(
  month: number,
  year: number,
  direction: -1 | 1
): { month: number; year: number } {
  const moved = new Date(year, month + direction, 1);
  return { month: moved.getMonth(), year: moved.getFullYear() };
}

interface EventCalendarProps {
  events: Event[];
  onSelectDate: (date: string) => void;
  selectedDate: string | null;
  viewMonth: number;
  viewYear: number;
  onMonthChange: (month: number, year: number) => void;
  onToday?: () => void;
}

export default function EventCalendar({
  events,
  onSelectDate,
  selectedDate,
  viewMonth,
  viewYear,
  onMonthChange,
  onToday,
}: EventCalendarProps) {
  const today = new Date();
  const todayKey = localDateKey(today);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();

  const eventDates = useMemo(() => {
    const dates = new Set<string>();
    for (const event of events) {
      const date = event.date?.toDate
        ? event.date.toDate()
        : new Date(event.date as unknown as string);
      dates.add(localDateKey(date));
    }
    return dates;
  }, [events]);

  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function changeMonth(direction: -1 | 1) {
    const next = moveCalendarMonth(viewMonth, viewYear, direction);
    onMonthChange(next.month, next.year);
  }

  function goToday() {
    onMonthChange(today.getMonth(), today.getFullYear());
    onSelectDate(todayKey);
    onToday?.();
  }

  const cells = [];
  for (let index = 0; index < firstDay; index += 1) {
    cells.push(<div key={`empty-${index}`} aria-hidden="true" />);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const hasEvent = eventDates.has(dateKey);
    const isSelected = selectedDate === dateKey;
    const isToday = todayKey === dateKey;

    cells.push(
      <button
        key={day}
        type="button"
        onClick={() => onSelectDate(dateKey)}
        className={`calendar-day${isSelected ? " calendar-day--selected" : ""}${isToday ? " calendar-day--today" : ""}`}
        aria-pressed={isSelected}
        aria-label={`${monthName.split(" ")[0]} ${day}${hasEvent ? ", has events" : ", no events"}${isToday ? ", today" : ""}`}
      >
        {day}
        {hasEvent && <span className="calendar-day__event" aria-hidden="true" />}
      </button>
    );
  }

  return (
    <section className="event-calendar" aria-label="Month calendar">
      <div className="event-calendar__header">
        <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month">
          <span aria-hidden="true">←</span>
        </button>
        <h2 aria-live="polite">{monthName}</h2>
        <div className="event-calendar__next">
          <button type="button" onClick={goToday}>Today</button>
          <button type="button" onClick={() => changeMonth(1)} aria-label="Next month">
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
      <div className="event-calendar__grid">
        {dayNames.map((day) => (
          <div key={day} className="event-calendar__weekday" aria-hidden="true">
            {day.slice(0, 1)}<span>{day.slice(1)}</span>
          </div>
        ))}
        {cells}
      </div>
    </section>
  );
}
