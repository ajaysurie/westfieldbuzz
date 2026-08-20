import { describe, expect, it, vi } from "vitest";
import { verifyEmailToken } from "../tokens";
import {
  activeSubscriberFromDocument,
  runFridayDigest,
  type DigestSender,
} from "../delivery";
import {
  eventFixture,
  FRIDAY,
  MemoryDigestRepository,
  preferencesFixture,
  subscriberFixture,
} from "./fixtures/digest-fixtures";

const SITE_ORIGIN = "https://westfieldbuzz.com";
const TOKEN_SECRET = "test-token-secret-that-is-long-enough";

function readyRepository(): MemoryDigestRepository {
  const repository = new MemoryDigestRepository();
  repository.inventory = [
    eventFixture({ id: "one", date: "2026-08-22T13:00:00.000Z" }),
    eventFixture({ id: "two", date: "2026-08-22T14:00:00.000Z" }),
    eventFixture({ id: "three", date: "2026-08-22T15:00:00.000Z" }),
  ];
  repository.subscribers = [subscriberFixture({ personalize: false })];
  return repository;
}

describe("Friday digest delivery", () => {
  it("excludes non-active and suppressed subscriber records", () => {
    expect(activeSubscriberFromDocument("pending", {
      status: "pending",
      email: "pending@example.com",
    })).toBeNull();
    expect(activeSubscriberFromDocument("suppressed", {
      status: "active",
      email: "suppressed@example.com",
      emailStatus: "complained",
    })).toBeNull();
    expect(activeSubscriberFromDocument("active", {
      status: "active",
      email: "active@example.com",
      tokenVersion: 2,
    })).toMatchObject({ id: "active", email: "active@example.com", tokenVersion: 2 });
  });

  it("creates one frozen edition and one delivery across simultaneous and repeated jobs", async () => {
    const repository = readyRepository();
    const sender = vi.fn(async () => {
      const delivery = repository.deliveryFor("2026-08-21", repository.subscribers[0].id);
      expect(delivery?.status).toBe("sending");
      return "resend-email-1";
    });
    const run = () => runFridayDigest({
      repository,
      siteOrigin: SITE_ORIGIN,
      tokenSecret: TOKEN_SECRET,
      sender,
      now: FRIDAY,
    });

    const simultaneous = await Promise.all([run(), run()]);
    const repeated = await run();

    expect(repository.editionCreates).toBe(1);
    expect(repository.deliveries.size).toBe(1);
    expect(sender).toHaveBeenCalledTimes(1);
    expect(simultaneous.reduce((total, item) => total + item.sent, 0)).toBe(1);
    expect(repeated).toMatchObject({ sent: 0, skipped: 1 });
  });

  it("holds without reading subscribers or sending when inventory is empty", async () => {
    const repository = new MemoryDigestRepository();
    repository.subscribers = [subscriberFixture()];
    const sender = vi.fn(async () => "unexpected");

    const result = await runFridayDigest({
      repository,
      siteOrigin: SITE_ORIGIN,
      tokenSecret: TOKEN_SECRET,
      sender,
      now: FRIDAY,
    });

    expect(result).toMatchObject({ editionStatus: "held", holdReason: "empty-inventory", sent: 0 });
    expect(repository.subscriberReads).toBe(0);
    expect(repository.deliveries.size).toBe(0);
    expect(sender).not.toHaveBeenCalled();
  });

  it("retries a failed delivery with its original frozen selection and provider key", async () => {
    const repository = new MemoryDigestRepository();
    repository.inventory = [
      eventFixture({ id: "music-1", category: "Music", town: "Cranford" }),
      eventFixture({ id: "music-2", category: "Music", town: "Cranford", date: "2026-08-22T15:00:00.000Z" }),
      eventFixture({ id: "music-3", category: "Music", town: "Cranford", date: "2026-08-22T16:00:00.000Z" }),
      eventFixture({ id: "history-1", category: "History", town: "Summit" }),
      eventFixture({ id: "history-2", category: "History", town: "Summit", date: "2026-08-23T15:00:00.000Z" }),
      eventFixture({ id: "history-3", category: "History", town: "Summit", date: "2026-08-23T16:00:00.000Z" }),
    ];
    const subscriber = subscriberFixture();
    repository.subscribers = [subscriber];
    repository.preferences.set("user-1", preferencesFixture({
      towns: [],
      interests: ["Music"],
    }));
    const selections: string[][] = [];
    const keys: string[] = [];
    const firstSender = vi.fn<DigestSender>(async (input) => {
      selections.push(input.props.events.map((event) => event.id));
      keys.push(input.deliveryKey);
      throw new Error("temporary Resend outage");
    });

    const first = await runFridayDigest({
      repository,
      siteOrigin: SITE_ORIGIN,
      tokenSecret: TOKEN_SECRET,
      sender: firstSender,
      now: FRIDAY,
    });
    repository.preferences.set("user-1", preferencesFixture({
      towns: [],
      interests: ["History"],
    }));
    const retrySender = vi.fn<DigestSender>(async (input) => {
      selections.push(input.props.events.map((event) => event.id));
      keys.push(input.deliveryKey);
      return "resend-email-retry";
    });
    const retry = await runFridayDigest({
      repository,
      siteOrigin: SITE_ORIGIN,
      tokenSecret: TOKEN_SECRET,
      sender: retrySender,
      now: new Date("2026-08-21T12:05:00.000Z"),
    });

    expect(first.failed).toBe(1);
    expect(retry.sent).toBe(1);
    expect(selections[0]).toEqual(["music-1", "music-2", "music-3"]);
    expect(selections[1]).toEqual(selections[0]);
    expect(keys[1]).toBe(keys[0]);
    expect(repository.deliveryFor("2026-08-21", subscriber.id)?.attempt).toBe(2);
  });

  it("issues a subscriber-bound signed unsubscribe URL", async () => {
    const repository = readyRepository();
    const subscriber = repository.subscribers[0];
    const sender = vi.fn(async (input) => {
      const pageUrl = new URL(input.props.unsubscribePageUrl);
      const oneClickUrl = new URL(input.props.oneClickUnsubscribeUrl);
      const token = pageUrl.searchParams.get("token") ?? "";
      expect(pageUrl.pathname).toBe("/unsubscribe");
      expect(oneClickUrl.pathname).toBe("/api/subscriptions/unsubscribe");
      expect(oneClickUrl.searchParams.get("token")).toBe(token);
      expect(verifyEmailToken(token, TOKEN_SECRET, FRIDAY)).toMatchObject({
        subscriberId: subscriber.id,
        purpose: "unsubscribe",
        version: subscriber.tokenVersion,
      });
      return "resend-email-1";
    });

    await runFridayDigest({
      repository,
      siteOrigin: SITE_ORIGIN,
      tokenSecret: TOKEN_SECRET,
      sender,
      now: FRIDAY,
    });

    expect(sender).toHaveBeenCalledOnce();
  });

  it("keeps a dry run read-only", async () => {
    const repository = readyRepository();
    const sender = vi.fn(async () => "unexpected");

    const result = await runFridayDigest({
      repository,
      siteOrigin: SITE_ORIGIN,
      tokenSecret: TOKEN_SECRET,
      sender,
      now: FRIDAY,
      dryRun: true,
    });

    expect(result).toMatchObject({ dryRun: true, subscribers: 1, sent: 0 });
    expect(repository.edition).toBeNull();
    expect(repository.deliveries.size).toBe(0);
    expect(sender).not.toHaveBeenCalled();
  });
});
