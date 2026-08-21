import { createHmac } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { subscriberIdForEmail } from "./tokens";

function privateKey(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export async function enforceSignupRateLimit(input: {
  db: Firestore;
  normalizedEmail: string;
  ip: string;
  secret: string;
  now?: Date;
}): Promise<boolean> {
  if (!input.secret) throw new Error("EMAIL_TOKEN_SECRET is required");
  const now = input.now ?? new Date();
  const windowMs = 60 * 60 * 1000;
  const limits = [
    { id: `signup-ip-${privateKey(input.ip || "unknown", input.secret)}`, max: 10 },
    { id: `signup-email-${subscriberIdForEmail(input.normalizedEmail)}`, max: 3 },
  ];

  return input.db.runTransaction(async (transaction) => {
    const refs = limits.map(({ id }) => input.db.collection("rateLimits").doc(id));
    const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
    const next = snapshots.map((snapshot, index) => {
      const data = snapshot.data();
      const resetAt = data?.resetAt instanceof Timestamp ? data.resetAt.toDate() : new Date(0);
      const inWindow = resetAt.getTime() > now.getTime();
      return {
        ref: refs[index],
        count: inWindow ? Number(data?.count ?? 0) : 0,
        resetAt: inWindow ? resetAt : new Date(now.getTime() + windowMs),
        max: limits[index].max,
      };
    });
    if (next.some((item) => item.count >= item.max)) return false;
    for (const item of next) {
      transaction.set(
        item.ref,
        { count: item.count + 1, resetAt: Timestamp.fromDate(item.resetAt) },
        { merge: true }
      );
    }
    return true;
  });
}
