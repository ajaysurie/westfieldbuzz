import { createHmac } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "./firebase-admin";

function hashClient(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function trustedClientIp(request: Request): string {
  const vercelIp = request.headers.get("x-vercel-forwarded-for");
  // x-forwarded-for is a user-controlled header at the public edge. Vercel's
  // canonical header is the only forwarded address trusted in production.
  const candidate = process.env.NODE_ENV === "production"
    ? vercelIp
    : vercelIp ?? request.headers.get("x-forwarded-for");
  const normalized = candidate?.split(",")[0]?.trim().replace(/[\u0000-\u001F\u007F]/g, "") ?? "";
  return normalized.slice(0, 128) || "unknown";
}

function rateLimitSecret(): string {
  const secret = process.env.SEARCH_RATE_LIMIT_SECRET ?? process.env.EMAIL_TOKEN_SECRET;
  if (!secret) throw new Error("SEARCH_RATE_LIMIT_SECRET is required");
  return secret;
}

/** Cheap single-document ingress guard, intentionally charged before body reads. */
export async function allowEventSearchIngress(request: Request, now = new Date()): Promise<boolean> {
  const secret = rateLimitSecret();
  const db = getAdminDb();
  const minuteRef = db
    .collection("rateLimits")
    .doc(`event-search-ingress-${hashClient(trustedClientIp(request), secret)}`);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(minuteRef);
    const resetAt =
      snapshot.data()?.resetAt instanceof Timestamp
        ? snapshot.data()!.resetAt.toDate()
        : new Date(0);
    const count = resetAt > now ? Number(snapshot.data()?.count ?? 0) : 0;
    if (count >= 120) return false;
    transaction.set(minuteRef, {
      count: count + 1,
      resetAt: Timestamp.fromDate(resetAt > now ? resetAt : new Date(now.getTime() + 60_000)),
    }, { merge: true });
    return true;
  });
}

/** Charges the costly per-client and global quota only for a validated search. */
export async function consumeEventSearchQuota(request: Request, now = new Date()): Promise<boolean> {
  const secret = rateLimitSecret();

  const db = getAdminDb();
  const minuteRef = db
    .collection("rateLimits")
    .doc(`event-search-ip-${hashClient(trustedClientIp(request), secret)}`);
  const dayKey = now.toISOString().slice(0, 10);
  const dailyRef = db.collection("rateLimits").doc(`event-search-global-${dayKey}`);

  return db.runTransaction(async (transaction) => {
    const [minuteSnapshot, dailySnapshot] = await Promise.all([
      transaction.get(minuteRef),
      transaction.get(dailyRef),
    ]);
    const minuteReset =
      minuteSnapshot.data()?.resetAt instanceof Timestamp
        ? minuteSnapshot.data()!.resetAt.toDate()
        : new Date(0);
    const minuteCount = minuteReset > now ? Number(minuteSnapshot.data()?.count ?? 0) : 0;
    const dailyCount = Number(dailySnapshot.data()?.count ?? 0);
    if (minuteCount >= 24 || dailyCount >= 750) return false;

    transaction.set(
      minuteRef,
      {
        count: minuteCount + 1,
        resetAt: Timestamp.fromDate(
          minuteReset > now ? minuteReset : new Date(now.getTime() + 60_000)
        ),
      },
      { merge: true }
    );
    transaction.set(
      dailyRef,
      {
        count: dailyCount + 1,
        resetAt: Timestamp.fromDate(new Date(`${dayKey}T23:59:59.999Z`)),
      },
      { merge: true }
    );
    return true;
  });
}

// Kept as a compatibility export for existing callers; new request handling
// uses the two stages above so malformed input never spends expensive quota.
export const allowEventSearch = consumeEventSearchQuota;
