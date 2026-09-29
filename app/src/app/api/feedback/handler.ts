import { parseFeedback, type FeedbackSubmission } from "@/lib/feedback";

export interface FeedbackRecord extends FeedbackSubmission {
  /** "web" when sent from the site's form; anything else is treated as an agent. */
  via: "web" | "agent";
  userAgent: string;
}

export interface FeedbackDeps {
  allow(request: Request): Promise<boolean>;
  eventExists(eventId: string): Promise<boolean>;
  save(record: FeedbackRecord): Promise<string>;
}

const MAX_BODY_BYTES = 8_000;

function error(status: number, message: string): Response {
  return Response.json({ ok: false, message }, { status });
}

/**
 * POST /api/feedback — report a problem with a listing or suggest a missing
 * event. Open to people and agents; no key required.
 */
export async function handleFeedback(request: Request, deps: FeedbackDeps): Promise<Response> {
  try {
    if (!(await deps.allow(request))) {
      return error(429, "Too many reports from this address. Try again in a minute.");
    }
  } catch {
    return error(503, "Feedback is temporarily unavailable. Try again shortly.");
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return error(413, "Feedback body is too large.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return error(400, "Send a JSON body.");
  }

  // Hidden form field: people never fill it, form-spamming bots do. Pretend
  // success so they do not learn to skip it.
  if (body && typeof body === "object" && (body as Record<string, unknown>).website) {
    return Response.json({ ok: true }, { status: 202 });
  }

  const parsed = parseFeedback(body);
  if (!parsed.ok) return error(400, parsed.message);

  try {
    if (parsed.value.eventId && !(await deps.eventExists(parsed.value.eventId))) {
      return error(404, "No event with that eventId.");
    }
    const via = (body as Record<string, unknown>).via === "web" ? "web" : "agent";
    const id = await deps.save({
      ...parsed.value,
      via,
      userAgent: (request.headers.get("user-agent") ?? "").slice(0, 300),
    });
    return Response.json({ ok: true, id }, { status: 202 });
  } catch {
    return error(503, "Feedback is temporarily unavailable. Try again shortly.");
  }
}
