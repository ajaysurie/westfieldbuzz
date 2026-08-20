import { describe, expect, it } from "vitest";
import { advanceDeliveryStatus, deliveryStatusForWebhook } from "../webhooks";

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
});
