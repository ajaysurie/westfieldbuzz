import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { normalizeEmail, subscriberIdForEmail } from "./tokens";

export type SubscriberStatus = "pending" | "active" | "unsubscribed";

export interface SubscriberRecord {
  id: string;
  email: string;
  status: SubscriberStatus;
  tokenVersion: number;
  userId: string | null;
  personalize: boolean;
}

function recordFromData(id: string, data: FirebaseFirestore.DocumentData): SubscriberRecord {
  return {
    id,
    email: String(data.email ?? ""),
    status: data.status ?? "pending",
    tokenVersion: Number(data.tokenVersion ?? 1),
    userId: data.userId ?? null,
    personalize: data.personalize === true,
  };
}

export async function requestSubscription(input: {
  db: Firestore;
  email: string;
  source: string;
  now?: Date;
}): Promise<{ subscriber: SubscriberRecord; confirmationRequired: boolean }> {
  const normalizedEmail = normalizeEmail(input.email);
  if (!normalizedEmail) throw new Error("INVALID_EMAIL");

  const now = input.now ?? new Date();
  const id = subscriberIdForEmail(normalizedEmail);
  const ref = input.db.collection("subscribers").doc(id);

  return input.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists) {
      const existing = recordFromData(id, snapshot.data() ?? {});
      if (existing.status === "active") {
        return { subscriber: existing, confirmationRequired: false };
      }

      const nextVersion = existing.tokenVersion + 1;
      transaction.set(
        ref,
        {
          email: normalizedEmail,
          status: "pending",
          tokenVersion: nextVersion,
          consentSource: input.source.slice(0, 80),
          consentRequestedAt: Timestamp.fromDate(now),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return {
        subscriber: { ...existing, email: normalizedEmail, status: "pending", tokenVersion: nextVersion },
        confirmationRequired: true,
      };
    }

    const subscriber: SubscriberRecord = {
      id,
      email: normalizedEmail,
      status: "pending",
      tokenVersion: 1,
      userId: null,
      personalize: false,
    };
    transaction.create(ref, {
      email: normalizedEmail,
      status: "pending",
      tokenVersion: 1,
      userId: null,
      personalize: false,
      consentSource: input.source.slice(0, 80),
      consentRequestedAt: Timestamp.fromDate(now),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { subscriber, confirmationRequired: true };
  });
}

export async function confirmSubscription(input: {
  db: Firestore;
  subscriberId: string;
  tokenVersion: number;
  now?: Date;
}): Promise<"confirmed" | "already-confirmed" | "invalid"> {
  const ref = input.db.collection("subscribers").doc(input.subscriberId);
  const now = input.now ?? new Date();
  return input.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return "invalid";
    const subscriber = recordFromData(snapshot.id, snapshot.data() ?? {});
    if (subscriber.tokenVersion !== input.tokenVersion) return "invalid";
    if (subscriber.status === "active") return "already-confirmed";
    if (subscriber.status !== "pending") return "invalid";
    transaction.update(ref, {
      status: "active",
      confirmedAt: Timestamp.fromDate(now),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return "confirmed";
  });
}

export async function unsubscribe(input: {
  db: Firestore;
  subscriberId: string;
  tokenVersion: number;
  now?: Date;
}): Promise<"unsubscribed" | "already-unsubscribed" | "invalid"> {
  const ref = input.db.collection("subscribers").doc(input.subscriberId);
  const now = input.now ?? new Date();
  return input.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return "invalid";
    const subscriber = recordFromData(snapshot.id, snapshot.data() ?? {});
    if (subscriber.tokenVersion !== input.tokenVersion) return "invalid";
    if (subscriber.status === "unsubscribed") return "already-unsubscribed";
    transaction.update(ref, {
      status: "unsubscribed",
      unsubscribedAt: Timestamp.fromDate(now),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return "unsubscribed";
  });
}
