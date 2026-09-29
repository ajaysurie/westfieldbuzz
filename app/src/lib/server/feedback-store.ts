import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { FeedbackDeps, FeedbackRecord } from "@/app/api/feedback/handler";
import type { FeedbackReason } from "@/lib/feedback";
import { getAdminDb } from "./firebase-admin";
import { hashedClientKey } from "./search-rate-limit";

const PER_CLIENT_PER_MINUTE = 6;
const GLOBAL_PER_DAY = 300;

async function allowFeedback(db: Firestore, request: Request, now = new Date()): Promise<boolean> {
  const minuteRef = db.collection("rateLimits").doc(`feedback-ip-${hashedClientKey(request)}`);
  const dayKey = now.toISOString().slice(0, 10);
  const dailyRef = db.collection("rateLimits").doc(`feedback-global-${dayKey}`);
  return db.runTransaction(async (transaction) => {
    const [minute, daily] = await Promise.all([transaction.get(minuteRef), transaction.get(dailyRef)]);
    const minuteReset = minute.data()?.resetAt instanceof Timestamp ? minute.data()!.resetAt.toDate() : new Date(0);
    const minuteCount = minuteReset > now ? Number(minute.data()?.count ?? 0) : 0;
    const dailyCount = Number(daily.data()?.count ?? 0);
    if (minuteCount >= PER_CLIENT_PER_MINUTE || dailyCount >= GLOBAL_PER_DAY) return false;
    transaction.set(minuteRef, {
      count: minuteCount + 1,
      resetAt: Timestamp.fromDate(minuteReset > now ? minuteReset : new Date(now.getTime() + 60_000)),
    }, { merge: true });
    transaction.set(dailyRef, {
      count: dailyCount + 1,
      resetAt: Timestamp.fromDate(new Date(`${dayKey}T23:59:59.999Z`)),
    }, { merge: true });
    return true;
  });
}

export function createFirestoreFeedbackDeps(db: Firestore = getAdminDb()): FeedbackDeps {
  return {
    allow: (request) => allowFeedback(db, request),
    async eventExists(eventId) {
      return (await db.collection("events").doc(eventId).get()).exists;
    },
    async save(record: FeedbackRecord) {
      const ref = await db.collection("feedback").add({
        ...record,
        status: "open",
        createdAt: FieldValue.serverTimestamp(),
      });
      return ref.id;
    },
  };
}

export interface FeedbackItem {
  id: string;
  eventId: string | null;
  eventTitle: string | null;
  reason: FeedbackReason;
  message: string;
  contact: string;
  via: "web" | "agent";
  userAgent: string;
  createdAt: string | null;
}

/**
 * Every open report, newest first, with the event title for context. Loaded
 * whole and sorted in memory: a limit before sorting would hide new reports
 * behind old ones, and sorting in the query needs a composite index. The
 * open set stays small because intake is capped at GLOBAL_PER_DAY and
 * resolving removes items.
 */
export async function listOpenFeedback(db: Firestore = getAdminDb()): Promise<FeedbackItem[]> {
  const snapshot = await db.collection("feedback")
    .where("status", "==", "open")
    .get();
  const eventIds = [...new Set(snapshot.docs.map((doc) => doc.data().eventId).filter((id): id is string => typeof id === "string"))];
  const events = eventIds.length
    ? await db.getAll(...eventIds.map((id) => db.collection("events").doc(id)))
    : [];
  const titles = new Map(events.map((doc) => [doc.id, typeof doc.data()?.title === "string" ? doc.data()!.title as string : null]));
  const items: FeedbackItem[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    const eventId = typeof data.eventId === "string" ? data.eventId : null;
    return {
      id: doc.id,
      eventId,
      eventTitle: eventId ? titles.get(eventId) ?? null : null,
      reason: data.reason,
      message: data.message ?? "",
      contact: data.contact ?? "",
      via: data.via === "web" ? "web" : "agent",
      userAgent: data.userAgent ?? "",
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : null,
    };
  });
  return items.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function resolveFeedback(id: string, resolvedBy: string, db: Firestore = getAdminDb()): Promise<boolean> {
  const ref = db.collection("feedback").doc(id);
  if (!(await ref.get()).exists) return false;
  await ref.update({ status: "resolved", resolvedBy, resolvedAt: FieldValue.serverTimestamp() });
  return true;
}
