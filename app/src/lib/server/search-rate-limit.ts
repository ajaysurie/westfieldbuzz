import { createHmac } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "./firebase-admin";

function hashClient(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function trustedClientIp(request: Request): string {
  return (
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0] ??
    request.headers.get("x-forwarded-for")?.split(",")[0] ??
    "unknown"
  ).trim();
}

export async function allowEventSearch(request: Request, now = new Date()): Promise<boolean> {
  const secret = process.env.SEARCH_RATE_LIMIT_SECRET ?? process.env.EMAIL_TOKEN_SECRET;
  if (!secret) throw new Error("SEARCH_RATE_LIMIT_SECRET is required");

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
