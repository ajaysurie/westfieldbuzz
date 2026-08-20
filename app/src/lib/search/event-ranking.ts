import type { SearchIntent } from "./event-intent";
import type { SearchableEvent } from "./event-retrieval";

export type MatchContribution =
  | "category"
  | "town"
  | "age"
  | "time"
  | "environment"
  | "budget"
  | "registration"
  | "availability"
  | "keyword-title"
  | "keyword-description"
  | "recently-verified";

export interface RankedEvent {
  event: SearchableEvent;
  score: number;
  contributions: MatchContribution[];
}
function includesTerm(value: string, term: string): boolean {
  return value.toLowerCase().includes(term.toLowerCase());
}

export function scoreEvent(
  event: SearchableEvent,
  intent: SearchIntent,
  now = new Date()
): RankedEvent {
  let score = 0;
  const contributions: MatchContribution[] = [];
  const add = (amount: number, contribution: MatchContribution) => {
    score += amount;
    contributions.push(contribution);
  };

  if (intent.categories.includes(event.category)) add(30, "category");
  if (intent.towns.some((town) => town.toLowerCase() === event.town.toLowerCase())) add(20, "town");
  if (intent.partyAges.length) add(18, "age");
  if (intent.timeOfDay.length) add(12, "time");
  if (intent.environment && intent.environment === event.environment) add(12, "environment");
  if (intent.budget && (event.isFree || event.costAmount != null)) add(10, "budget");
  if (intent.registration && intent.registration === event.registration) add(8, "registration");
  if (intent.availability.includes(event.availability as never)) add(6, "availability");

  for (const keyword of intent.keywords) {
    if (includesTerm(event.title, keyword)) add(12, "keyword-title");
    else if (includesTerm(`${event.description} ${event.tags.join(" ")}`, keyword)) {
      add(5, "keyword-description");
    }
  }

  const verifiedAt = new Date(event.lastVerifiedAt);
  if (!Number.isNaN(verifiedAt.valueOf())) {
    const ageHours = Math.max(0, (now.valueOf() - verifiedAt.valueOf()) / 3_600_000);
    if (ageHours <= 24) add(5, "recently-verified");
    else if (ageHours <= 72) add(3, "recently-verified");
    else if (ageHours <= 168) add(1, "recently-verified");
  }

  return { event, score, contributions: [...new Set(contributions)] };
}

export function rankEvents(
  events: SearchableEvent[],
  intent: SearchIntent,
  now = new Date()
): RankedEvent[] {
  return events
    .map((event) => scoreEvent(event, intent, now))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.event.date.localeCompare(right.event.date) ||
        left.event.id.localeCompare(right.event.id)
    );
}
