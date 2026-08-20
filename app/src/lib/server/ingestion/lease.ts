import { Timestamp, type Firestore } from "firebase-admin/firestore";

export interface LeaseClaim {
  key: string;
  owner: string;
  acquired: boolean;
  leaseUntil: Date;
}

export function leaseIsActive(
  data: { owner?: unknown; leaseUntil?: unknown } | undefined,
  now: Date
): boolean {
  if (!data?.owner || !data.leaseUntil) return false;
  const value = data.leaseUntil;
  const leaseUntil =
    value instanceof Date
      ? value
      : value instanceof Timestamp
        ? value.toDate()
        : typeof value === "object" &&
            value != null &&
            "toDate" in value &&
            typeof value.toDate === "function"
          ? value.toDate()
          : new Date(Number.NaN);
  return !Number.isNaN(leaseUntil.getTime()) && leaseUntil > now;
}

export async function acquireLease(input: {
  db: Firestore;
  key: string;
  owner: string;
  now?: Date;
  durationMs?: number;
}): Promise<LeaseClaim> {
  const now = input.now ?? new Date();
  const leaseUntil = new Date(now.getTime() + (input.durationMs ?? 5 * 60_000));
  const ref = input.db.collection("automationLeases").doc(input.key);
  const acquired = await input.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists && leaseIsActive(snapshot.data(), now)) return false;
    transaction.set(
      ref,
      {
        owner: input.owner,
        acquiredAt: Timestamp.fromDate(now),
        leaseUntil: Timestamp.fromDate(leaseUntil),
      },
      { merge: true }
    );
    return true;
  });
  return { key: input.key, owner: input.owner, acquired, leaseUntil };
}

export async function releaseLease(input: {
  db: Firestore;
  key: string;
  owner: string;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const ref = input.db.collection("automationLeases").doc(input.key);
  await input.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || snapshot.data()?.owner !== input.owner) return;
    transaction.set(
      ref,
      {
        leaseUntil: Timestamp.fromDate(now),
        releasedAt: Timestamp.fromDate(now),
      },
      { merge: true }
    );
  });
}
