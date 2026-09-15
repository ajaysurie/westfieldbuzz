/**
 * Detects weekly-recurring events inside a fetched window. Ingested sources
 * publish one document per occurrence, so recurrence is derivable from repeats
 * of the same title at the same venue on the same weekday.
 */

export interface RecurrenceInput {
  id: string;
  title: string;
  location: string;
  date: Date;
}

const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

function normalizeKey(event: RecurrenceInput): string {
  const title = event.title.trim().toLowerCase().replace(/\s+/g, " ");
  const location = event.location.trim().toLowerCase().replace(/\s+/g, " ");
  return `${title}|${location}`;
}

function localParts(date: Date): { day: string; weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value("weekday"));
  return {
    day: `${value("year")}-${value("month")}-${value("day")}`,
    weekday: weekdayIndex,
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

/**
 * Returns event id to label ("Every Tuesday" when occurrences share a weekday,
 * "Weekly" otherwise). An event qualifies when it recurs on at least two
 * distinct days within ~90 minutes of the same start time.
 */
export function detectWeeklyRecurrence(events: RecurrenceInput[]): Map<string, string> {
  const groups = new Map<string, RecurrenceInput[]>();
  for (const event of events) {
    const key = normalizeKey(event);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }

  const labels = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const byWeekday = new Map<number, { days: Set<string>; minutes: number[]; ids: string[] }>();
    for (const event of group) {
      const parts = localParts(event.date);
      const bucket = byWeekday.get(parts.weekday) ?? { days: new Set(), minutes: [], ids: [] };
      bucket.days.add(parts.day);
      bucket.minutes.push(parts.minutes);
      bucket.ids.push(event.id);
      byWeekday.set(parts.weekday, bucket);
    }

    let matched = false;
    for (const [weekday, bucket] of byWeekday) {
      if (bucket.days.size < 2) continue;
      const first = bucket.minutes[0];
      if (bucket.minutes.every((minutes) => Math.abs(minutes - first) <= 90)) {
        for (const id of bucket.ids) labels.set(id, `Every ${WEEKDAYS[weekday]}`);
        matched = true;
      }
    }
    if (!matched) {
      const parts = group.map((event) => localParts(event.date));
      const first = parts[0].minutes;
      const distinctDays = new Set(parts.map((part) => part.day)).size >= 2;
      if (distinctDays && parts.every((part) => Math.abs(part.minutes - first) <= 90)) {
        for (const event of group) labels.set(event.id, "Weekly");
      }
    }
  }
  return labels;
}
