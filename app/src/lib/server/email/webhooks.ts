export type DeliveryStatus =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "delayed"
  | "failed"
  | "bounced"
  | "complained"
  | "suppressed";

const STATUS_PRIORITY: Record<DeliveryStatus, number> = {
  queued: 0,
  sending: 1,
  sent: 2,
  delayed: 3,
  delivered: 4,
  failed: 5,
  bounced: 6,
  complained: 7,
  suppressed: 8,
};

export function deliveryStatusForWebhook(type: string): DeliveryStatus | null {
  switch (type) {
    case "email.sent":
      return "sent";
    case "email.delivery_delayed":
      return "delayed";
    case "email.delivered":
      return "delivered";
    case "email.failed":
      return "failed";
    case "email.bounced":
      return "bounced";
    case "email.complained":
      return "complained";
    case "email.suppressed":
      return "suppressed";
    default:
      return null;
  }
}

export function advanceDeliveryStatus(
  current: DeliveryStatus,
  incoming: DeliveryStatus
): DeliveryStatus {
  return STATUS_PRIORITY[incoming] >= STATUS_PRIORITY[current] ? incoming : current;
}
