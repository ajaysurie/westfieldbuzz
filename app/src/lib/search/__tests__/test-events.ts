import type { SearchableEvent } from "../event-retrieval";

export function eventFixture(
  overrides: Partial<SearchableEvent> & Pick<SearchableEvent, "id" | "title" | "date">
): SearchableEvent {
  const base: SearchableEvent = {
    id: overrides.id,
    title: overrides.title,
    description: "A source-backed local event.",
    date: overrides.date,
    endDate: null,
    location: "Westfield Memorial Library",
    town: "Westfield",
    category: "Community",
    status: "scheduled",
    availability: "available",
    publicationStatus: "published",
    freshnessStatus: "current",
    sourceUrl: "https://example.org/event",
    sourceId: "fixture-source",
    lastVerifiedAt: "2026-08-19T14:00:00.000Z",
    tags: [],
    minAge: null,
    maxAge: null,
    costAmount: null,
    isFree: null,
    environment: null,
    registration: null,
    accessibility: [],
    driveMinutes: null,
    factEvidence: {
      age: "known",
      cost: "known",
      environment: "known",
      registration: "known",
      accessibility: "known",
      travelTime: "known",
    },
  };
  return { ...base, ...overrides };
}
