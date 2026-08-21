import { describe, expect, it } from "vitest";
import {
  advanceDeliveryStatus,
  deliveryStatusForWebhook,
  isSubscriberSuppressingDeliveryStatus,
  reduceDeliveryTransition,
} from "../webhooks";

describe("Resend delivery transitions", () => {
  it("maps provider events", () => {
    expect(deliveryStatusForWebhook("email.delivered")).toBe("delivered");
    expect(deliveryStatusForWebhook("email.opened")).toBeNull();
  });

  it("does not regress on out-of-order events", () => {
    expect(advanceDeliveryStatus("delivered", "sent")).toBe("delivered");
    expect(advanceDeliveryStatus("bounced", "delivered")).toBe("bounced");
    expect(advanceDeliveryStatus("sent", "delayed")).toBe("delayed");
  });

  it("does not apply a stale terminal webhook or suppress from it", () => {
    const transition = reduceDeliveryTransition({
      currentStatus: "delivered",
      currentProviderUpdatedAt: new Date("2026-08-21T12:05:00.000Z"),
      incomingStatus: "bounced",
      incomingProviderUpdatedAt: new Date("2026-08-21T12:04:00.000Z"),
    });

    expect(transition).toMatchObject({ status: "delivered", applied: false });
    expect(isSubscriberSuppressingDeliveryStatus("bounced") && transition.applied).toBe(false);
  });

  it("allows equal/newer events to advance and recognizes terminal suppression", () => {
    const transition = reduceDeliveryTransition({
      currentStatus: "sent",
      currentProviderUpdatedAt: new Date("2026-08-21T12:05:00.000Z"),
      incomingStatus: "suppressed",
      incomingProviderUpdatedAt: new Date("2026-08-21T12:05:00.000Z"),
    });

    expect(transition).toMatchObject({ status: "suppressed", applied: true });
    expect(isSubscriberSuppressingDeliveryStatus(transition.status)).toBe(true);
  });
});
