"use client";

import { useState } from "react";
import Link from "next/link";

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, setState] = useState<"ready" | "working" | "done" | "invalid" | "unavailable">(
    token ? "ready" : "invalid"
  );

  async function submit() {
    setState("working");
    try {
      const response = await fetch("/api/subscriptions/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.ok) setState("done");
      else setState(response.status >= 500 ? "unavailable" : "invalid");
    } catch {
      setState("unavailable");
    }
  }

  if (state === "done") {
    return (
      <>
        <h1>You&apos;re unsubscribed.</h1>
        <p>You won&apos;t receive another Westfield Buzz Friday email.</p>
        <Link href="/events" className="btn btn-primary">Browse events anytime</Link>
      </>
    );
  }

  if (state === "invalid") {
    return (
      <>
        <h1>That link isn&apos;t valid.</h1>
        <p>It may have expired or been replaced. You can reply to the email if you still need help.</p>
        <Link href="/" className="btn btn-primary">Return home</Link>
      </>
    );
  }

  if (state === "unavailable") {
    return (
      <>
        <h1>We couldn&apos;t update that yet.</h1>
        <p>Your link is still here. Please retry so we can stop the next Friday email.</p>
        <button className="btn btn-primary" type="button" onClick={submit}>Try again</button>
      </>
    );
  }

  return (
    <>
      <h1>Stop Friday emails?</h1>
      <p>This takes effect immediately. You can still browse and search every event without an account.</p>
      <button className="btn btn-primary" type="button" onClick={submit} disabled={state === "working"}>
        {state === "working" ? "Unsubscribing…" : "Unsubscribe me"}
      </button>
    </>
  );
}
