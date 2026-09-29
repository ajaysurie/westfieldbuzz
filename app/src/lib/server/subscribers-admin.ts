import { Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  countSubscribers,
  type SubscriberCounts,
  type SubscriberListItem,
  type SubscriberStatus,
} from "@/lib/subscribers-admin";
import { activeSubscriberFromDocument } from "./email/delivery";
import { getAdminDb } from "./firebase-admin";

const STATUSES: readonly SubscriberStatus[] = ["pending", "active", "unsubscribed", "suppressed"];

function iso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function statusOf(id: string, data: FirebaseFirestore.DocumentData): SubscriberStatus {
  // Unknown or missing statuses read as pending, as the signup code does.
  const status: SubscriberStatus = STATUSES.includes(data.status) ? data.status : "pending";
  // An "active" record the Friday send skips (bounced, complained, or marked
  // suppressed) is not a recipient, so it must not be counted as one.
  if (status === "active" && !activeSubscriberFromDocument(id, data)) return "suppressed";
  return status;
}

/**
 * Every subscriber, newest sign-up first. The whole collection is read so the
 * counts and the CSV are exact; a capped read would return documents in id
 * order and silently drop recent sign-ups. Revisit when the list reaches the
 * tens of thousands. Only the fields the admin page shows leave the server:
 * token versions, user links, and the document id (derived from the address)
 * stay behind.
 */
export async function listSubscribers(db: Firestore = getAdminDb()): Promise<{
  items: SubscriberListItem[];
  counts: SubscriberCounts;
}> {
  const snapshot = await db.collection("subscribers").get();
  const items = snapshot.docs.flatMap((doc): SubscriberListItem[] => {
    const data = doc.data();
    if (typeof data.email !== "string" || !data.email) return [];
    return [{
      email: data.email,
      status: statusOf(doc.id, data),
      source: typeof data.consentSource === "string" ? data.consentSource : "",
      signedUpAt: iso(data.createdAt),
      confirmedAt: iso(data.confirmedAt),
      unsubscribedAt: iso(data.unsubscribedAt),
    }];
  });
  items.sort((a, b) => (b.signedUpAt ?? "").localeCompare(a.signedUpAt ?? ""));
  return { items, counts: countSubscribers(items) };
}
