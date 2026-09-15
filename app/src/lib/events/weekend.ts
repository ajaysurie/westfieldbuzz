/**
 * The "this weekend" window in Eastern time: Friday through Sunday, current
 * weekend when today is inside it, otherwise the coming one.
 */

export interface WeekendWindow {
  /** Local-midnight start. Clamped to today once the weekend begins. */
  from: Date;
  /** Local end-of-day Sunday. */
  to: Date;
  /** e.g. "September 18–20". */
  label: string;
  startKey: string;
  endKey: string;
}

function easternParts(date: Date): { year: number; month: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value("weekday")),
  };
}

function localMidnight(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function weekendWindow(now: Date): WeekendWindow {
  const eastern = easternParts(now);
  const today = localMidnight(eastern.year, eastern.month, eastern.day);
  // Days until Friday (5). Sat/Sun map to the Friday just past.
  const offset = eastern.weekday === 6 ? -1 : eastern.weekday === 0 ? -2 : 5 - eastern.weekday;
  const friday = new Date(today);
  friday.setDate(friday.getDate() + offset);
  const sunday = new Date(friday);
  sunday.setDate(sunday.getDate() + 2);
  sunday.setHours(23, 59, 59, 999);
  const from = today > friday ? today : friday;

  const monthDay = (date: Date) => date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const label = friday.getMonth() === sunday.getMonth()
    ? `${friday.toLocaleDateString("en-US", { month: "long" })} ${friday.getDate()}–${sunday.getDate()}`
    : `${monthDay(friday)} – ${monthDay(sunday)}`;

  return { from, to: sunday, label, startKey: dateKey(friday), endKey: dateKey(sunday) };
}
