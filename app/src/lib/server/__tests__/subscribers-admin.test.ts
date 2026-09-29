import { describe, expect, it } from "vitest";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { listSubscribers } from "../subscribers-admin";

const at = (iso: string) => Timestamp.fromDate(new Date(iso));

function dbWith(docs: Array<Record<string, unknown>>): Firestore {
  return {
    collection: (name: string) => {
      expect(name).toBe("subscribers");
      // A plain read of the whole collection; there is deliberately no limit().
      return { get: async () => ({ docs: docs.map((data, index) => ({ id: `id-${index}`, data: () => data })) }) };
    },
  } as unknown as Firestore;
}

describe("listSubscribers", () => {
  it("returns newest first with counts, and only the fields the page shows", async () => {
    const { items, counts } = await listSubscribers(dbWith([
      { email: "old@example.com", status: "active", consentSource: "website", createdAt: at("2026-09-01T12:00:00Z"), confirmedAt: at("2026-09-01T12:05:00Z"), tokenVersion: 3, userId: "uid-1" },
      { email: "new@example.com", status: "pending", consentSource: "website", createdAt: at("2026-09-29T12:00:00Z"), tokenVersion: 1, userId: null },
      { email: "gone@example.com", status: "unsubscribed", createdAt: at("2026-09-10T12:00:00Z"), unsubscribedAt: at("2026-09-20T12:00:00Z") },
    ]));

    expect(items.map((i) => i.email)).toEqual(["new@example.com", "gone@example.com", "old@example.com"]);
    expect(counts).toEqual({ active: 1, pending: 1, unsubscribed: 1, suppressed: 0, total: 3 });
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

  it("keeps the newest sign-ups however many subscribers there are", async () => {
    // Documents come back in id order, not date order; a capped read would drop these.
    const docs = Array.from({ length: 6000 }, (_, index) => ({
      email: `r${index}@example.com`,
      status: "active",
      createdAt: at(index === 5999 ? "2026-09-29T12:00:00Z" : "2026-01-01T12:00:00Z"),
    }));
    const { items, counts } = await listSubscribers(dbWith(docs));
    expect(items).toHaveLength(6000);
    expect(counts.active).toBe(6000);
    expect(items[0]!.email).toBe("r5999@example.com");
  });

  it("does not count an active record the Friday send skips as a recipient", async () => {
    const createdAt = at("2026-09-02T12:00:00Z");
    const { items, counts } = await listSubscribers(dbWith([
      { email: "ok@example.com", status: "active", createdAt },
      { email: "bounced@example.com", status: "active", emailStatus: "bounced", createdAt },
      { email: "complained@example.com", status: "active", emailStatus: "complained", createdAt },
      { email: "flagged@example.com", status: "active", suppressed: true, createdAt },
      { email: "dated@example.com", status: "active", suppressedAt: at("2026-09-03T12:00:00Z"), createdAt },
      { email: "emailflag@example.com", status: "active", emailSuppressedAt: at("2026-09-03T12:00:00Z"), createdAt },
    ]));
    expect(counts).toEqual({ active: 1, pending: 0, unsubscribed: 0, suppressed: 5, total: 6 });
    expect(items.filter((i) => i.status === "active").map((i) => i.email)).toEqual(["ok@example.com"]);
  });
});
