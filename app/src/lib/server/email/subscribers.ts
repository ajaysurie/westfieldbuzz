import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { normalizeEmail, subscriberIdForEmail } from "./tokens";

export type SubscriberStatus = "pending" | "active" | "unsubscribed" | "suppressed";

export interface SubscriberRecord {
  id: string;
  email: string;
  status: SubscriberStatus;
  tokenVersion: number;
  userId: string | null;
  personalize: boolean;
  confirmationSentAt: Date | null;
  confirmationAttemptedAt: Date | null;
  confirmationTokenExpiresAt: Date | null;
}

function recordFromData(id: string, data: FirebaseFirestore.DocumentData): SubscriberRecord {
  return {
    id,
    email: String(data.email ?? ""),
    status: data.status ?? "pending",
    tokenVersion: Number(data.tokenVersion ?? 1),
    userId: data.userId ?? null,
    personalize: data.personalize === true,
    confirmationSentAt:
      data.confirmationSentAt instanceof Timestamp
        ? data.confirmationSentAt.toDate()
        : null,
    confirmationAttemptedAt:
      data.confirmationAttemptedAt instanceof Timestamp
        ? data.confirmationAttemptedAt.toDate()
        : null,
    confirmationTokenExpiresAt:
      data.confirmationTokenExpiresAt instanceof Timestamp
        ? data.confirmationTokenExpiresAt.toDate()
        : null,
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
      if (existing.status === "suppressed") {
        return { subscriber: existing, confirmationRequired: false };
      }

      if (
        existing.status === "pending" &&
        (existing.confirmationSentAt || existing.confirmationAttemptedAt) &&
        now.getTime() - (existing.confirmationSentAt ?? existing.confirmationAttemptedAt)!.getTime()
          < 15 * 60 * 1000
      ) {
        return { subscriber: existing, confirmationRequired: false };
      }

      const tokenExpired = existing.confirmationTokenExpiresAt != null
        && existing.confirmationTokenExpiresAt.getTime() <= now.getTime();
      const nextVersion = tokenExpired ? existing.tokenVersion + 1 : existing.tokenVersion;
      transaction.set(
        ref,
        {
          email: normalizedEmail,
          status: "pending",
          tokenVersion: nextVersion,
          consentSource: input.source.slice(0, 80),
          consentRequestedAt: Timestamp.fromDate(now),
          ...(tokenExpired ? {
            confirmationSentAt: FieldValue.delete(),
            confirmationAttemptedAt: FieldValue.delete(),
            confirmationTokenExpiresAt: FieldValue.delete(),
          } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return {
        subscriber: {
          ...existing, email: normalizedEmail, status: "pending", tokenVersion: nextVersion,
          ...(tokenExpired ? { confirmationSentAt: null, confirmationAttemptedAt: null, confirmationTokenExpiresAt: null } : {}),
        },
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
      confirmationSentAt: null,
      confirmationAttemptedAt: null,
      confirmationTokenExpiresAt: null,
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

export async function recordConfirmationAttempt(input: {
  db: Firestore;
  subscriber: SubscriberRecord;
  confirmationUrl: string;
  idempotencyKey: string;
  expiresAt?: Date;
  attemptedAt?: Date;
}): Promise<string> {
  const deliveryId = `${input.subscriber.id}_${input.subscriber.tokenVersion}`;
  const attemptedAt = input.attemptedAt ?? new Date();
  const subscriberRef = input.db.collection("subscribers").doc(input.subscriber.id);
  const deliveryRef = input.db.collection("confirmationDeliveries").doc(deliveryId);
  await input.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(subscriberRef);
    if (!snapshot.exists) throw new Error("SUBSCRIBER_NOT_FOUND");
    const subscriber = recordFromData(snapshot.id, snapshot.data() ?? {});
    if (
      subscriber.tokenVersion !== input.subscriber.tokenVersion ||
      subscriber.status !== "pending"
    ) {
      throw new Error("SUBSCRIBER_STATE_CHANGED");
    }
    const existingDelivery = await transaction.get(deliveryRef);
    const existing = existingDelivery.exists ? existingDelivery.data() ?? {} : {};
    const existingExpiresAt = existing.expiresAt instanceof Timestamp ? existing.expiresAt.toDate() : null;
    const expiresAt = input.expiresAt ?? new Date(attemptedAt.getTime() + 48 * 60 * 60 * 1000);
    const reusable = typeof existing.confirmationUrl === "string"
      && typeof existing.idempotencyKey === "string"
      && (!existingExpiresAt || existingExpiresAt.getTime() > attemptedAt.getTime());
    const confirmationUrl = reusable ? existing.confirmationUrl : input.confirmationUrl;
    const idempotencyKey = reusable ? existing.idempotencyKey : input.idempotencyKey;
    transaction.set(
      deliveryRef,
      {
        subscriberId: input.subscriber.id,
        tokenVersion: input.subscriber.tokenVersion,
        email: input.subscriber.email,
        confirmationUrl,
        idempotencyKey,
        expiresAt: Timestamp.fromDate(reusable && existingExpiresAt ? existingExpiresAt : expiresAt),
        status: "sending",
        attemptedAt: Timestamp.fromDate(attemptedAt),
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    // An attempt is not proof of provider acceptance. It is only a short
    // cooldown/idempotency lease until success is durably recorded.
    transaction.update(subscriberRef, {
      confirmationAttemptedAt: Timestamp.fromDate(attemptedAt),
      confirmationTokenExpiresAt: Timestamp.fromDate(reusable && existingExpiresAt ? existingExpiresAt : expiresAt),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return deliveryId;
}

export async function confirmationAttemptDetails(input: { db: Firestore; deliveryId: string }): Promise<{ confirmationUrl: string; idempotencyKey: string } | null> {
  const data = (await input.db.collection("confirmationDeliveries").doc(input.deliveryId).get()).data();
  return data && typeof data.confirmationUrl === "string" && typeof data.idempotencyKey === "string"
    ? { confirmationUrl: data.confirmationUrl, idempotencyKey: data.idempotencyKey }
    : null;
}

export async function recordConfirmationAccepted(input: {
  db: Firestore;
  deliveryId: string;
  providerEmailId: string;
  acceptedAt?: Date;
}): Promise<void> {
  const acceptedAt = input.acceptedAt ?? new Date();
  const deliveryRef = input.db.collection("confirmationDeliveries").doc(input.deliveryId);
  await input.db.runTransaction(async (transaction) => {
    const deliverySnapshot = await transaction.get(deliveryRef);
    if (!deliverySnapshot.exists) return;
    const delivery = deliverySnapshot.data() ?? {};
    const subscriberId = typeof delivery.subscriberId === "string" ? delivery.subscriberId : null;
    const subscriberRef = subscriberId ? input.db.collection("subscribers").doc(subscriberId) : null;
    const subscriberSnapshot = subscriberRef ? await transaction.get(subscriberRef) : null;
    const currentStatus = delivery.status === "delivered"
      || delivery.status === "bounced"
      || delivery.status === "complained"
      || delivery.status === "suppressed"
      || delivery.status === "failed"
      || delivery.status === "delayed"
      || delivery.status === "sent"
      ? delivery.status
      : "sending";

    transaction.update(deliveryRef, {
      // Resend may deliver the webhook before its send API response reaches us.
      // Never replace a later provider state with this acceptance callback.
      status: currentStatus === "sending" ? "sent" : currentStatus,
      providerEmailId: input.providerEmailId,
      acceptedAt: Timestamp.fromDate(acceptedAt),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (!subscriberRef || !subscriberSnapshot?.exists) return;
    const subscriber = recordFromData(subscriberSnapshot.id, subscriberSnapshot.data() ?? {});
    if (
      subscriber.status !== "pending"
      || subscriber.tokenVersion !== Number(delivery.tokenVersion)
    ) return;
    const sentAt = subscriber.confirmationSentAt;
    transaction.update(subscriberRef, {
      confirmationSentAt: Timestamp.fromDate(
        sentAt && sentAt.getTime() > acceptedAt.getTime() ? sentAt : acceptedAt
      ),
      confirmationAttemptedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function recordConfirmationFailed(input: {
  db: Firestore;
  deliveryId: string;
  subscriber: SubscriberRecord;
  error: string;
  failedAt?: Date;
}): Promise<void> {
  const failedAt = input.failedAt ?? new Date();
  const deliveryRef = input.db.collection("confirmationDeliveries").doc(input.deliveryId);
  const subscriberRef = input.db.collection("subscribers").doc(input.subscriber.id);
  await input.db.runTransaction(async (transaction) => {
    const [deliverySnapshot, subscriberSnapshot] = await Promise.all([
      transaction.get(deliveryRef),
      transaction.get(subscriberRef),
    ]);
    if (!deliverySnapshot.exists) return;
    const delivery = deliverySnapshot.data() ?? {};
    if (
      delivery.status !== "sending"
      || delivery.subscriberId !== input.subscriber.id
      || Number(delivery.tokenVersion) !== input.subscriber.tokenVersion
    ) return;
    transaction.update(deliveryRef, {
      status: "failed",
      failedAt: Timestamp.fromDate(failedAt),
      lastError: input.error.slice(0, 500),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (!subscriberSnapshot.exists) return;
    const subscriber = recordFromData(subscriberSnapshot.id, subscriberSnapshot.data() ?? {});
    if (
      subscriber.status === "pending"
      && subscriber.tokenVersion === input.subscriber.tokenVersion
    ) {
      transaction.update(subscriberRef, {
        confirmationAttemptedAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
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
    if (subscriber.status === "suppressed") return "already-unsubscribed";
    transaction.update(ref, {
      status: "unsubscribed",
      unsubscribedAt: Timestamp.fromDate(now),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return "unsubscribed";
  });
}
