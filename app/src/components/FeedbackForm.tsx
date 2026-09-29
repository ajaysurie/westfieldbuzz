"use client";

import { FormEvent, useState } from "react";
import {
  FEEDBACK_CONTACT_MAX,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_REASONS,
  type FeedbackReason,
} from "@/lib/feedback";

const LISTING_REASONS: FeedbackReason[] = ["wrong-details", "cancelled", "duplicate", "not-local", "other"];
const GENERAL_REASONS: FeedbackReason[] = ["missing-event", "other"];

type FormState = "idle" | "submitting" | "sent" | "error";

/**
 * Report a problem with one listing (with eventId) or suggest a missing event
 * (without). Posts to the same /api/feedback contract agents use.
 */
export default function FeedbackForm({ eventId }: { eventId?: string }) {
  const reasons = eventId ? LISTING_REASONS : GENERAL_REASONS;
  const [reason, setReason] = useState<FeedbackReason>(reasons[0]!);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setError("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, reason, message, contact, website, via: "web" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? "Please try again.");
      setState("sent");
    } catch (caught) {
      setState("error");
      setError(caught instanceof Error ? caught.message : "Please try again.");
    }
  }

  if (state === "sent") {
    return (
      <p className="feedback-form__sent" role="status">
        Thanks. We read every report and fix listings at the source when we can.
      </p>
    );
  }

  const messageRequired = reason === "missing-event" || reason === "other";
  const idPrefix = eventId ? "listing-feedback" : "site-feedback";

  return (
    <form className="feedback-form" onSubmit={submit}>
      <fieldset>
        <legend>{eventId ? "What's wrong?" : "What would you like to tell us?"}</legend>
        <div className="feedback-form__reasons">
          {reasons.map((option) => (
            <label key={option}>
              <input
                type="radio"
                name={`${idPrefix}-reason`}
                value={option}
                checked={reason === option}
                onChange={() => setReason(option)}
              />
              {FEEDBACK_REASONS[option]}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor={`${idPrefix}-message`}>
        {reason === "missing-event" ? "Event name, date, and a link if you have one" : `Details${messageRequired ? "" : " (optional)"}`}
      </label>
      <textarea
        id={`${idPrefix}-message`}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={FEEDBACK_MESSAGE_MAX}
        required={messageRequired}
        rows={3}
      />
      <label htmlFor={`${idPrefix}-contact`}>Email, if you&apos;d like a reply (optional)</label>
      <input
        id={`${idPrefix}-contact`}
        type="email"
        autoComplete="email"
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        maxLength={FEEDBACK_CONTACT_MAX}
      />
      {/* Honeypot: hidden from people and assistive tech, filled by bots. */}
      <input
        className="feedback-form__trap"
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
      />
      <button type="submit" className="detail-action" disabled={state === "submitting"}>
        {state === "submitting" ? "Sending…" : "Send"}
      </button>
      {state === "error" && <p className="feedback-form__error" role="alert">{error}</p>}
    </form>
  );
}
