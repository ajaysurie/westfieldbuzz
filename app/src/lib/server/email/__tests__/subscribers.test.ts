import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import {
  recordConfirmationAccepted,
  recordConfirmationAttempt,
  recordConfirmationFailed,
  requestSubscription,
} from "../subscribers";

type Ref = { collection: string; id: string };

class MemoryFirestore {
  readonly documents = new Map<string, Record<string, unknown>>();

  collection(collection: string) {
    return { doc: (id: string): Ref => ({ collection, id }) };
  }

  async runTransaction<T>(callback: (transaction: {
    get: (ref: Ref) => Promise<{ exists: boolean; id: string; data: () => Record<string, unknown> }>;
    create: (ref: Ref, data: Record<string, unknown>) => void;
    set: (ref: Ref, data: Record<string, unknown>, options?: { merge?: boolean }) => void;
    update: (ref: Ref, data: Record<string, unknown>) => void;
  }) => Promise<T>): Promise<T> {
    const key = (ref: Ref) => `${ref.collection}/${ref.id}`;
    const apply = (ref: Ref, data: Record<string, unknown>, merge = true) => {
      const next = merge ? { ...(this.documents.get(key(ref)) ?? {}) } : {};
      for (const [field, value] of Object.entries(data)) {
        // The production code only deletes the cooldown in these tests. The
        // Firestore sentinel itself is intentionally opaque to callers.
        if (field === "confirmationAttemptedAt" && !(value instanceof Timestamp)) delete next[field];
        else next[field] = value;
      }
      this.documents.set(key(ref), next);
    };
    return callback({
      get: async (ref) => {
        const data = this.documents.get(key(ref));
        return { exists: Boolean(data), id: ref.id, data: () => data ?? {} };
      },
      create: (ref, data) => apply(ref, data, false),
      set: (ref, data, options) => apply(ref, data, options?.merge !== false),
      update: (ref, data) => apply(ref, data),
    });
  }

  data(collection: string, id: string): Record<string, unknown> {
    return this.documents.get(`${collection}/${id}`) ?? {};
  }
}

const EMAIL = "reader@example.com";
const URL = "https://westfieldbuzz.com/subscribe/confirm?token=test";

async function pendingSubscriber(db: MemoryFirestore, at = new Date("2026-08-21T12:00:00.000Z")) {
  return requestSubscription({
    db: db as never,
    email: EMAIL,
    source: "test",
    now: at,
  });
}

describe("confirmation delivery recovery", () => {
  it("does not claim confirmation success until acceptance and permits a definite failure retry", async () => {
    const db = new MemoryFirestore();
    const first = await pendingSubscriber(db);
    const deliveryId = await recordConfirmationAttempt({
      db: db as never,
      subscriber: first.subscriber,
      confirmationUrl: URL,
      idempotencyKey: "confirm/test/1",
      attemptedAt: new Date("2026-08-21T12:00:01.000Z"),
    });

    const beforeFailure = db.data("subscribers", first.subscriber.id);
    expect(beforeFailure.confirmationSentAt).toBeUndefined();
    expect(beforeFailure.confirmationAttemptedAt).toBeInstanceOf(Timestamp);

    await recordConfirmationFailed({
      db: db as never,
      deliveryId,
      subscriber: first.subscriber,
      error: "Resend rejected sender",
      failedAt: new Date("2026-08-21T12:00:02.000Z"),
    });
    expect(db.data("confirmationDeliveries", deliveryId).status).toBe("failed");
    expect(db.data("subscribers", first.subscriber.id).confirmationAttemptedAt).toBeUndefined();

    const retry = await pendingSubscriber(db, new Date("2026-08-21T12:01:00.000Z"));
    expect(retry).toMatchObject({ confirmationRequired: true });
    expect(retry.subscriber.tokenVersion).toBe(1);
  });

  it("keeps a timeout attempt cooled down and idempotent", async () => {
    const db = new MemoryFirestore();
    const first = await pendingSubscriber(db);
    await recordConfirmationAttempt({
      db: db as never,
      subscriber: first.subscriber,
      confirmationUrl: URL,
      idempotencyKey: "confirm/test/1",
      attemptedAt: new Date("2026-08-21T12:00:01.000Z"),
    });

    // A provider timeout deliberately has no recordConfirmationFailed call.
    const immediateRetry = await pendingSubscriber(db, new Date("2026-08-21T12:01:00.000Z"));
    expect(immediateRetry).toMatchObject({ confirmationRequired: false });
    expect(immediateRetry.subscriber.tokenVersion).toBe(1);
    expect(db.data("subscribers", first.subscriber.id).confirmationAttemptedAt).toBeInstanceOf(Timestamp);
  });

  it("does not clear a newer subscriber's cooldown for a stale-token failure", async () => {
    const db = new MemoryFirestore();
    const first = await pendingSubscriber(db);
    const deliveryId = await recordConfirmationAttempt({
      db: db as never,
      subscriber: first.subscriber,
      confirmationUrl: URL,
      idempotencyKey: "confirm/test/1",
    });
    db.data("subscribers", first.subscriber.id).tokenVersion = 2;

    await recordConfirmationFailed({
      db: db as never,
      deliveryId,
      subscriber: first.subscriber,
      error: "definite failure",
    });

    expect(db.data("subscribers", first.subscriber.id).confirmationAttemptedAt).toBeInstanceOf(Timestamp);
  });

  it("records confirmation acceptance and never replaces an earlier webhook completion", async () => {
    const db = new MemoryFirestore();
    const first = await pendingSubscriber(db);
    const deliveryId = await recordConfirmationAttempt({
      db: db as never,
      subscriber: first.subscriber,
      confirmationUrl: URL,
      idempotencyKey: "confirm/test/1",
    });
    db.data("confirmationDeliveries", deliveryId).status = "delivered";

    await recordConfirmationAccepted({
      db: db as never,
      deliveryId,
      providerEmailId: "resend-id",
      acceptedAt: new Date("2026-08-21T12:01:00.000Z"),
    });

    expect(db.data("confirmationDeliveries", deliveryId)).toMatchObject({
      status: "delivered",
      providerEmailId: "resend-id",
      acceptedAt: expect.any(Timestamp),
    });
    expect(db.data("subscribers", first.subscriber.id).confirmationSentAt).toBeInstanceOf(Timestamp);
  });
});
