import { describe, expect, it, vi } from "vitest";
import { verifyEmailToken } from "../tokens";
import { EmailProviderTimeoutError } from "../sender";
import {
  activeSubscriberFromDocument,
  deliveryStatusAfterAcceptance,
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
  it("allows a retryable local failure to become sent, without regressing provider outcomes", () => {
    expect(deliveryStatusAfterAcceptance("failed", "local")).toBe("sent");
    expect(deliveryStatusAfterAcceptance("failed", "provider")).toBe("failed");
    expect(deliveryStatusAfterAcceptance("delivered", undefined)).toBe("delivered");
    expect(deliveryStatusAfterAcceptance("suppressed", undefined)).toBe("suppressed");
  });

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
    const unsubscribeUrls: string[] = [];
    const firstSender = vi.fn<DigestSender>(async (input) => {
      selections.push(input.props.events.map((event) => event.id));
      keys.push(input.deliveryKey);
      unsubscribeUrls.push(input.props.oneClickUnsubscribeUrl);
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
      unsubscribeUrls.push(input.props.oneClickUnsubscribeUrl);
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
    expect(unsubscribeUrls[1]).toBe(unsubscribeUrls[0]);
    expect(repository.deliveryFor("2026-08-21", subscriber.id)?.attempt).toBe(2);
  });

  it("recovers a held edition when inventory becomes healthy", async () => {
    const repository = new MemoryDigestRepository();
    repository.subscribers = [subscriberFixture()];
    const sender = vi.fn(async () => "resend-after-recovery");

    const held = await runFridayDigest({
      repository,
      siteOrigin: SITE_ORIGIN,
      tokenSecret: TOKEN_SECRET,
      sender,
      now: FRIDAY,
    });
    repository.inventory = [
      eventFixture({ id: "one" }),
      eventFixture({ id: "two", date: "2026-08-22T15:00:00.000Z" }),
      eventFixture({ id: "three", date: "2026-08-23T15:00:00.000Z" }),
    ];
    const recovered = await runFridayDigest({
      repository,
      siteOrigin: SITE_ORIGIN,
      tokenSecret: TOKEN_SECRET,
      sender,
      now: new Date("2026-08-21T12:15:00.000Z"),
    });

    expect(held.editionStatus).toBe("held");
    expect(recovered.editionStatus).toBe("ready");
    expect(recovered.sent).toBe(1);
  });

  it("bounds concurrent provider calls", async () => {
    const repository = readyRepository();
    repository.subscribers = Array.from({ length: 6 }, (_, index) =>
      subscriberFixture({ id: String(index).padStart(64, "a"), email: `person${index}@example.com` })
    );
    let active = 0;
    let maximum = 0;
    const sender = vi.fn(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return `resend-${maximum}`;
    });

    const result = await runFridayDigest({
      repository,
      siteOrigin: SITE_ORIGIN,
      tokenSecret: TOKEN_SECRET,
      sender,
      sendDelayMs: 0,
      now: FRIDAY,
    });

    expect(result.sent).toBe(6);
    expect(maximum).toBeLessThanOrEqual(2);
  });

  it("does not spend send-delay time on already claimed deliveries", async () => {
    const repository = readyRepository();
    repository.subscribers = Array.from({ length: 200 }, (_, index) =>
      subscriberFixture({
        id: String(index).padStart(64, "a"),
        email: `already-sent-${index}@example.com`,
      })
    );
    for (const subscriber of repository.subscribers) {
      await repository.claimDelivery({
        editionId: "2026-08-21",
        subscriberId: subscriber.id,
        selection: { eventIds: ["one", "two", "three"], personalized: false, reason: "generic" },
        now: FRIDAY,
      });
      const delivery = repository.deliveryFor("2026-08-21", subscriber.id);
      if (delivery) delivery.status = "sent";
    }
    const startedAt = Date.now();
    const result = await runFridayDigest({
      repository,
      siteOrigin: SITE_ORIGIN,
      tokenSecret: TOKEN_SECRET,
      sender: async () => "should-not-send",
      sendDelayMs: 25,
      now: FRIDAY,
    });

    expect(result.skipped).toBe(200);
    expect(Date.now() - startedAt).toBeLessThan(250);
  });

  it("does not mark an accepted provider request failed when sent-state persistence fails", async () => {
    class PersistenceFailureRepository extends MemoryDigestRepository {
      override async markDeliverySent(): Promise<void> {
        throw new Error("Firestore unavailable after acceptance");
      }
    }
    const repository = new PersistenceFailureRepository();
    repository.inventory = readyRepository().inventory;
    repository.subscribers = [subscriberFixture()];

    const result = await runFridayDigest({
      repository,
      siteOrigin: SITE_ORIGIN,
      tokenSecret: TOKEN_SECRET,
      sender: async () => "accepted-provider-id",
      now: FRIDAY,
    });

    expect(result.failed).toBe(1);
    expect(repository.deliveryFor("2026-08-21", repository.subscribers[0].id)?.status).toBe("sending");
  });

  it("keeps an ambiguous provider timeout leased instead of retrying immediately", async () => {
    const repository = readyRepository();

    const result = await runFridayDigest({
      repository,
      siteOrigin: SITE_ORIGIN,
      tokenSecret: TOKEN_SECRET,
      sender: async () => {
        throw new EmailProviderTimeoutError();
      },
      now: FRIDAY,
    });

    expect(result.failed).toBe(1);
    expect(repository.deliveryFor("2026-08-21", repository.subscribers[0].id)?.status).toBe("sending");
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

  it("re-checks consent after claiming a delivery and before provider submission", async () => {
    class UnsubscribedWhilePausedRepository extends MemoryDigestRepository {
      async authorizeDelivery(): Promise<boolean> { return false; }
    }
    const repository = new UnsubscribedWhilePausedRepository();
    repository.inventory = readyRepository().inventory;
    repository.subscribers = [subscriberFixture({ personalize: false })];
    const sender = vi.fn(async () => "must-not-send");

    const result = await runFridayDigest({
      repository, siteOrigin: SITE_ORIGIN, tokenSecret: TOKEN_SECRET, sender, now: FRIDAY,
    });

    expect(result).toMatchObject({ sent: 0, skipped: 1 });
    expect(sender).not.toHaveBeenCalled();
  });

  it("reports a next cursor when the bounded subscriber page has more work", async () => {
    class PagedRepository extends MemoryDigestRepository {
      async listActiveSubscribersPage() {
        return { subscribers: this.subscribers.slice(0, 1), nextCursor: "next-subscriber" };
      }
    }
    const repository = new PagedRepository();
    repository.inventory = readyRepository().inventory;
    repository.subscribers = [subscriberFixture({ personalize: false })];
    const result = await runFridayDigest({
      repository, siteOrigin: SITE_ORIGIN, tokenSecret: TOKEN_SECRET, sender: async () => "accepted", now: FRIDAY,
    });
    expect(result).toMatchObject({ status: "partial", nextCursor: "next-subscriber", sent: 1 });
  });
});
