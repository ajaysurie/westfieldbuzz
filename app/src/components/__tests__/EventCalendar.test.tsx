import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Timestamp } from "firebase/firestore";
import type { Event } from "@/lib/firestore";
import EventCalendar, { localDateKey, moveCalendarMonth } from "../EventCalendar";

afterEach(() => { cleanup(); vi.useRealTimers(); });

const event = {
  id: "evt-1",
  title: "Town concert",
  date: { toDate: () => new Date("2026-12-31T23:00:00-05:00") } as Timestamp,
} as Event;

describe("EventCalendar", () => {
  it("moves across month and year boundaries", () => {
    expect(moveCalendarMonth(11, 2026, 1)).toEqual({ month: 0, year: 2027 });
    expect(moveCalendarMonth(0, 2027, -1)).toEqual({ month: 11, year: 2026 });
  });

  it("uses New York local calendar dates", () => {
    expect(localDateKey(new Date("2026-08-20T02:00:00Z"))).toBe("2026-08-19");
  });

  it("announces event days and selects a date", () => {
    const onSelectDate = vi.fn();
    render(<EventCalendar events={[event]} selectedDate={null} viewMonth={11} viewYear={2026} onSelectDate={onSelectDate} onMonthChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /December 31, has events/ }));
    expect(onSelectDate).toHaveBeenCalledWith("2026-12-31");
  });
});
