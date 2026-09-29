import { describe, expect, it } from "vitest";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { listSubscribers, MAX_LISTED_SUBSCRIBERS } from "../subscribers-admin";

const at = (iso: string) => Timestamp.fromDate(new Date(iso));

function dbWith(docs: Array<Record<string, unknown>>): Firestore {
  return {
    collection: (name: string) => {
      expect(name).toBe("subscribers");
      return {
        limit: (limit: number) => ({
          get: async () => {
            const taken = docs.slice(0, limit);
            return { size: taken.length, docs: taken.map((data) => ({ data: () => data })) };
          },
        }),
      };
    },
  } as unknown as Firestore;
}

describe("listSubscribers", () => {
  it("returns newest first with counts, and only the fields the page shows", async () => {
    const { items, counts, truncated } = await listSubscribers(dbWith([
      { email: "old@example.com", status: "active", consentSource: "website", createdAt: at("2026-09-01T12:00:00Z"), confirmedAt: at("2026-09-01T12:05:00Z"), tokenVersion: 3, userId: "uid-1" },
      { email: "new@example.com", status: "pending", consentSource: "website", createdAt: at("2026-09-29T12:00:00Z"), tokenVersion: 1, userId: null },
      { email: "gone@example.com", status: "unsubscribed", createdAt: at("2026-09-10T12:00:00Z"), unsubscribedAt: at("2026-09-20T12:00:00Z") },
    ]));

    expect(items.map((i) => i.email)).toEqual(["new@example.com", "gone@example.com", "old@example.com"]);
    expect(counts).toEqual({ active: 1, pending: 1, unsubscribed: 1, suppressed: 0, total: 3 });
    expect(truncated).toBe(false);
    expect(items[2]).toEqual({
      email: "old@example.com",
      status: "active",
      source: "website",
      signedUpAt: "2026-09-01T12:00:00.000Z",
      confirmedAt: "2026-09-01T12:05:00.000Z",
      unsubscribedAt: null,
    });
    expect(JSON.stringify(items)).not.toMatch(/tokenVersion|uid-1|userId/);
  });

  it("reads a missing or unknown status as pending and skips records without an email", async () => {
    const { items } = await listSubscribers(dbWith([
      { email: "a@example.com", status: "weird", createdAt: at("2026-09-02T12:00:00Z") },
      { email: "b@example.com", createdAt: at("2026-09-03T12:00:00Z") },
      { status: "active" },
      { email: "", status: "active" },
    ]));
    expect(items.map((i) => [i.email, i.status])).toEqual([["b@example.com", "pending"], ["a@example.com", "pending"]]);
  });

  it("says so when the collection is larger than the cap", async () => {
    const docs = Array.from({ length: MAX_LISTED_SUBSCRIBERS + 1 }, (_, index) => ({
      email: `r${index}@example.com`, status: "active", createdAt: at("2026-09-01T12:00:00Z"),
    }));
    const { items, truncated } = await listSubscribers(dbWith(docs));
    expect(truncated).toBe(true);
    expect(items).toHaveLength(MAX_LISTED_SUBSCRIBERS);
  });
});
