import type { SearchIntent } from "./event-intent";
import type { RankedEvent } from "./event-ranking";

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

export function explainMatch(
  ranked: RankedEvent,
  intent: SearchIntent
): string {
  const { event, contributions } = ranked;
  const reasons: string[] = [];

  if (contributions.includes("age")) {
    const range = event.minAge != null && event.maxAge != null
      ? `ages ${event.minAge}–${event.maxAge}`
      : event.minAge != null
        ? `ages ${event.minAge}+`
        : `up to age ${event.maxAge}`;
    reasons.push(`listed for ${range}`);
  }
  if (contributions.includes("environment") && event.environment) {
    reasons.push(`listed as ${event.environment}`);
  }
  if (contributions.includes("town")) reasons.push(`in ${event.town}`);
  if (intent.maxDriveMinutes != null && event.driveMinutes != null) {
    reasons.push(`${event.driveMinutes} minutes away`);
  }
  if (contributions.includes("budget")) {
    if (event.isFree) reasons.push("listed as free");
    else if (event.costAmount != null) reasons.push(`listed at ${formatMoney(event.costAmount)}`);
  }
  if (contributions.includes("registration") && event.registration) {
    reasons.push(event.registration === "drop-in" ? "listed as drop-in" : "registration is required");
  }
  if (contributions.includes("category")) reasons.push(`matches ${event.category}`);
  if (
    contributions.includes("keyword-title") ||
    contributions.includes("keyword-description")
  ) {
    const matched = intent.keywords.filter((keyword) =>
      `${event.title} ${event.description} ${event.tags.join(" ")}`
        .toLowerCase()
        .includes(keyword.toLowerCase())
    );
    if (matched.length) reasons.push(`mentions ${matched.slice(0, 2).join(" and ")}`);
  }

  if (!reasons.length) {
    return `Scheduled in ${event.town} and verified against its source.`;
  }
  const sentence = reasons.slice(0, 3).join(", ");
  return `${sentence[0].toUpperCase()}${sentence.slice(1)}.`;
}

export function resultLabel(index: number): string {
  if (index === 0) return "Best overall fit";
  if (index === 1) return "Another strong match";
  return "Also worth a look";
}
