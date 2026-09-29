/** Single-select quick filters for the homepage agenda. */
export type AgendaFilterKey = "all" | "free" | "kids" | `town:${string}`;

export interface AgendaFilterOption {
  key: AgendaFilterKey;
  label: string;
}

interface FilterableEvent {
  town?: string;
  category: string;
  isFree?: boolean | null;
}

export function matchesAgendaFilter(event: FilterableEvent, key: AgendaFilterKey): boolean {
  if (key === "all") return true;
  if (key === "free") return event.isFree === true;
  if (key === "kids") return event.category === "Family & Kids";
  return (event.town ?? "").trim().toLowerCase() === key.slice("town:".length).toLowerCase();
}

/** Only offer filters that match something; towns ordered by event count. */
export function agendaFilterOptions(events: FilterableEvent[]): AgendaFilterOption[] {
  const options: AgendaFilterOption[] = [{ key: "all", label: "Everything" }];
  if (events.some((event) => matchesAgendaFilter(event, "free"))) options.push({ key: "free", label: "Free" });
  if (events.some((event) => matchesAgendaFilter(event, "kids"))) options.push({ key: "kids", label: "Kids & family" });
  const townCounts = new Map<string, number>();
  for (const event of events) {
    const town = event.town?.trim();
    if (town) townCounts.set(town, (townCounts.get(town) ?? 0) + 1);
  }
  if (townCounts.size > 1) {
    const towns = [...townCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    for (const [town] of towns) options.push({ key: `town:${town}`, label: town });
  }
  return options;
}
