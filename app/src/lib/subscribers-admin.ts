/**
 * Friday list subscribers as the admin page sees them. Client-safe: no server
 * imports, so the page, the route, and the tests share one shape.
 */
export type SubscriberStatus = "pending" | "active" | "unsubscribed" | "suppressed";

export const SUBSCRIBER_STATUS_LABELS: Record<SubscriberStatus, string> = {
  active: "Active",
  pending: "Waiting to confirm",
  unsubscribed: "Unsubscribed",
  suppressed: "Stopped (bounce or complaint)",
};

export interface SubscriberListItem {
  email: string;
  status: SubscriberStatus;
  /** Where they signed up, e.g. "website". */
  source: string;
  signedUpAt: string | null;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
}

export type SubscriberCounts = Record<SubscriberStatus, number> & { total: number };

export function countSubscribers(items: SubscriberListItem[]): SubscriberCounts {
  const counts: SubscriberCounts = { active: 0, pending: 0, unsubscribed: 0, suppressed: 0, total: items.length };
  for (const item of items) counts[item.status] += 1;
  return counts;
}

/**
 * A CSV cell. Quoted per RFC 4180, and a leading = + - @ or tab/CR is
 * neutralized so a spreadsheet never runs an address as a formula.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function subscribersToCsv(items: SubscriberListItem[]): string {
  const header = ["email", "status", "signed_up", "confirmed", "unsubscribed", "source"];
  const rows = items.map((item) => [
    item.email,
    item.status,
    item.signedUpAt ?? "",
    item.confirmedAt ?? "",
    item.unsubscribedAt ?? "",
    item.source,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
