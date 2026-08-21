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

export interface DeliveryTransition {
  status: DeliveryStatus;
  providerUpdatedAt: Date | null;
  applied: boolean;
}

/**
 * Applies a provider event exactly once in provider-time order.  The event
 * inbox may be received out of order, so a persisted newer provider timestamp
 * is authoritative even when the inbox event itself is new to us.
 */
export function reduceDeliveryTransition(input: {
  currentStatus: DeliveryStatus;
  currentProviderUpdatedAt: Date | null;
  incomingStatus: DeliveryStatus;
  incomingProviderUpdatedAt: Date;
}): DeliveryTransition {
  const incomingAt = input.incomingProviderUpdatedAt;
  if (Number.isNaN(incomingAt.getTime())) {
    return {
      status: input.currentStatus,
      providerUpdatedAt: input.currentProviderUpdatedAt,
      applied: false,
    };
  }
  if (
    input.currentProviderUpdatedAt
    && incomingAt.getTime() < input.currentProviderUpdatedAt.getTime()
  ) {
    return {
      status: input.currentStatus,
      providerUpdatedAt: input.currentProviderUpdatedAt,
      applied: false,
    };
  }
  return {
    status: advanceDeliveryStatus(input.currentStatus, input.incomingStatus),
    providerUpdatedAt: incomingAt,
    applied: true,
  };
}

export function isSubscriberSuppressingDeliveryStatus(status: DeliveryStatus): boolean {
  return status === "bounced" || status === "complained" || status === "suppressed";
}
