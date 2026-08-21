export type EventQueryView = "agenda" | "calendar";

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function endOfLocalDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function publicEventQueryRange(input: {
  view: EventQueryView;
  month: number;
  year: number;
  selectedDate: string | null;
}): { from: Date; to: Date } {
  if (input.view !== "calendar") {
    if (input.selectedDate) {
      const from = new Date(`${input.selectedDate}T00:00:00`);
      return { from, to: endOfLocalDay(from) };
    }
    const from = startOfToday();
    const to = new Date(from);
    to.setDate(to.getDate() + 90);
    return { from, to: endOfLocalDay(to) };
  }

  const first = new Date(input.year, input.month, 1);
  const from = new Date(first);
  from.setDate(from.getDate() - from.getDay());
  const to = new Date(from);
  to.setDate(to.getDate() + 41);
  return { from, to: endOfLocalDay(to) };
}
