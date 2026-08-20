import { Timestamp } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Ref = { collection: string; id: string };

const mocks = vi.hoisted(() => ({
  event: null as unknown,
  db: null as unknown,
}));

vi.mock("resend", () => ({
  Resend: class {
    webhooks = { verify: () => mocks.event };
  },
}));

vi.mock("@/lib/server/firebase-admin", () => ({
  getAdminDb: () => mocks.db,
}));

import { POST } from "./route";

class MemoryFirestore {
  readonly documents = new Map<string, Record<string, unknown>>();

  collection(collection: string) {
    return { doc: (id: string): Ref => ({ collection, id }) };
  }

  async runTransaction<T>(callback: (transaction: {
    get: (ref: Ref) => Promise<{ exists: boolean; id: string; data: () => Record<string, unknown> }>;
    set: (ref: Ref, data: Record<string, unknown>, options?: { merge?: boolean }) => void;
    update: (ref: Ref, data: Record<string, unknown>) => void;
  }) => Promise<T>): Promise<T> {
    const key = (ref: Ref) => `${ref.collection}/${ref.id}`;
    const write = (ref: Ref, data: Record<string, unknown>, merge = true) => {
      this.documents.set(key(ref), merge ? { ...(this.documents.get(key(ref)) ?? {}), ...data } : data);
    };
    return callback({
      get: async (ref) => {
        const data = this.documents.get(key(ref));
        return { exists: Boolean(data), id: ref.id, data: () => data ?? {} };
      },
      set: (ref, data, options) => write(ref, data, options?.merge !== false),
      update: (ref, data) => write(ref, data),
    });
  }

  seed(collection: string, id: string, data: Record<string, unknown>) {
    this.documents.set(`${collection}/${id}`, data);
  }

  data(collection: string, id: string) {
    return this.documents.get(`${collection}/${id}`) ?? {};
  }
}

function webhookRequest(eventId: string) {
  return new Request("https://westfieldbuzz.com/api/resend/webhook", {
    method: "POST",
    headers: {
      "svix-id": eventId,
      "svix-timestamp": "123",
      "svix-signature": "signature",
    },
    body: "signed-body",
  });
}

function event(type: string, createdAt: string) {
  return {
    type,
    created_at: createdAt,
    data: {
      email_id: "resend-1",
      tags: { delivery_id: "delivery-1" },
    },
  };
}

describe("POST /api/resend/webhook", () => {
  let db: MemoryFirestore;

  beforeEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = "test-secret";
    db = new MemoryFirestore();
    db.seed("digestDeliveries", "delivery-1", { status: "sent", subscriberId: "subscriber-1" });
    db.seed("subscribers", "subscriber-1", { status: "active" });
    mocks.db = db;
  });

  afterEach(() => {
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  it("deduplicates an event id, rejects stale suppression, and applies a current terminal suppression", async () => {
    mocks.event = event("email.delivered", "2026-08-21T12:05:00.000Z");
    await POST(webhookRequest("evt-delivered"));
    expect(db.data("digestDeliveries", "delivery-1").status).toBe("delivered");

    // Replaying the same inbox id cannot mutate the delivery a second time.
    mocks.event = event("email.bounced", "2026-08-21T12:06:00.000Z");
    await POST(webhookRequest("evt-delivered"));
    expect(db.data("digestDeliveries", "delivery-1").status).toBe("delivered");

    mocks.event = event("email.bounced", "2026-08-21T12:04:00.000Z");
    await POST(webhookRequest("evt-stale-bounce"));
    expect(db.data("resendWebhookEvents", "evt-stale-bounce").processed).toBe(true);
    expect(db.data("subscribers", "subscriber-1").status).toBe("active");

    mocks.event = event("email.bounced", "2026-08-21T12:06:00.000Z");
    await POST(webhookRequest("evt-current-bounce"));
    expect(db.data("digestDeliveries", "delivery-1")).toMatchObject({
      status: "bounced",
      providerUpdatedAt: expect.any(Timestamp),
    });
    expect(db.data("subscribers", "subscriber-1").status).toBe("suppressed");
  });
});
