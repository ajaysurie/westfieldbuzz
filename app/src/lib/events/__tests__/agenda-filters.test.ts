import { describe, expect, it } from "vitest";
import { agendaFilterOptions, matchesAgendaFilter } from "@/lib/events/agenda-filters";

const events = [
  { town: "Westfield", category: "Music", isFree: true },
  { town: "Westfield", category: "Family & Kids", isFree: false },
  { town: "Summit", category: "Music", isFree: null },
];

describe("agenda filters", () => {
  it("offers free, kids, and towns by count", () => {
    expect(agendaFilterOptions(events).map((option) => option.key))
      .toEqual(["all", "free", "kids", "town:Westfield", "town:Summit"]);
  });

  it("omits filters that match nothing and a lone town", () => {
    expect(agendaFilterOptions([{ town: "Westfield", category: "Music", isFree: null }]).map((option) => option.key))
      .toEqual(["all"]);
  });

  it("matches each filter", () => {
    expect(events.filter((event) => matchesAgendaFilter(event, "free"))).toHaveLength(1);
    expect(events.filter((event) => matchesAgendaFilter(event, "kids"))).toHaveLength(1);
    expect(events.filter((event) => matchesAgendaFilter(event, "town:summit"))).toHaveLength(1);
    expect(events.filter((event) => matchesAgendaFilter(event, "all"))).toHaveLength(3);
  });
});
