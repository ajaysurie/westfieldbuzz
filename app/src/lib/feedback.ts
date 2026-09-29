/**
 * Listing feedback shared by the site form, POST /api/feedback, and the admin
 * queue. People and agents use the same contract.
 */
export const FEEDBACK_REASONS = {
  "wrong-details": "Wrong date, time, or place",
  cancelled: "Cancelled or postponed",
  duplicate: "Listed twice",
  "not-local": "Not a local event",
  "missing-event": "An event you're missing",
  other: "Something else",
} as const;

export type FeedbackReason = keyof typeof FEEDBACK_REASONS;

export const FEEDBACK_MESSAGE_MAX = 1000;
export const FEEDBACK_CONTACT_MAX = 200;

/** Reasons that mean nothing without an explanation. */
const NEEDS_MESSAGE: ReadonlySet<FeedbackReason> = new Set(["missing-event", "other"]);

export interface FeedbackSubmission {
  eventId: string | null;
  reason: FeedbackReason;
  message: string;
  contact: string;
}

export type FeedbackParseResult =
  | { ok: true; value: FeedbackSubmission }
  | { ok: false; message: string };

const EVENT_ID = /^[A-Za-z0-9_-]{1,180}$/;

function text(value: unknown, max: number): string | null {
  if (value == null) return "";
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return trimmed.length > max ? null : trimmed;
}

export function parseFeedback(body: unknown): FeedbackParseResult {
  if (!body || typeof body !== "object") return { ok: false, message: "Send a JSON object." };
  const input = body as Record<string, unknown>;

  const reason = input.reason;
  if (typeof reason !== "string" || !(reason in FEEDBACK_REASONS)) {
    return { ok: false, message: `reason must be one of: ${Object.keys(FEEDBACK_REASONS).join(", ")}.` };
  }

  let eventId: string | null = null;
  if (input.eventId != null && input.eventId !== "") {
    if (typeof input.eventId !== "string" || !EVENT_ID.test(input.eventId)) {
      return { ok: false, message: "eventId must be an id from /api/events." };
    }
    eventId = input.eventId;
  }

  const message = text(input.message, FEEDBACK_MESSAGE_MAX);
  if (message === null) return { ok: false, message: `message must be text up to ${FEEDBACK_MESSAGE_MAX} characters.` };
  const contact = text(input.contact, FEEDBACK_CONTACT_MAX);
  if (contact === null) return { ok: false, message: `contact must be text up to ${FEEDBACK_CONTACT_MAX} characters.` };

  const typedReason = reason as FeedbackReason;
  if (NEEDS_MESSAGE.has(typedReason) && message.length < 3) {
    return { ok: false, message: "Add a short message describing the event or problem." };
  }
  if (!eventId && typedReason !== "missing-event" && typedReason !== "other") {
    return { ok: false, message: "eventId is required for feedback about a listing." };
  }

  return { ok: true, value: { eventId, reason: typedReason, message, contact } };
}
