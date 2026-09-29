import { Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  countSubscribers,
  type SubscriberCounts,
  type SubscriberListItem,
  type SubscriberStatus,
} from "@/lib/subscribers-admin";
import { getAdminDb } from "./firebase-admin";

/** The admin page loads the whole list; past this it says so instead of guessing. */
export const MAX_LISTED_SUBSCRIBERS = 5000;

const STATUSES: readonly SubscriberStatus[] = ["pending", "active", "unsubscribed", "suppressed"];

function iso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

/**
 * Every subscriber, newest sign-up first. Only the fields the admin page
 * shows leave the server; token versions, user links, and the document id
 * (derived from the address) stay behind.
 */
export async function listSubscribers(db: Firestore = getAdminDb()): Promise<{
  items: SubscriberListItem[];
  counts: SubscriberCounts;
  truncated: boolean;
}> {
  const snapshot = await db.collection("subscribers").limit(MAX_LISTED_SUBSCRIBERS + 1).get();
  const truncated = snapshot.size > MAX_LISTED_SUBSCRIBERS;
  const items = snapshot.docs.slice(0, MAX_LISTED_SUBSCRIBERS).flatMap((doc): SubscriberListItem[] => {
    const data = doc.data();
    if (typeof data.email !== "string" || !data.email) return [];
    return [{
      email: data.email,
      // Unknown or missing statuses read as pending, as the signup code does.
      status: STATUSES.includes(data.status) ? data.status : "pending",
      source: typeof data.consentSource === "string" ? data.consentSource : "",
      signedUpAt: iso(data.createdAt),
      confirmedAt: iso(data.confirmedAt),
      unsubscribedAt: iso(data.unsubscribedAt),
    }];
  });
  items.sort((a, b) => (b.signedUpAt ?? "").localeCompare(a.signedUpAt ?? ""));
  return { items, counts: countSubscribers(items), truncated };
}
