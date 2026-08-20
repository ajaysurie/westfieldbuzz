"use client";

import { FormEvent, useState } from "react";

type SignupState = "idle" | "submitting" | "success" | "error";

export function FridaySignup() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SignupState>("idle");
  const [message, setMessage] = useState("No account needed. Confirm once by email.");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    try {
      const response = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? "Please try again.");
      setState("success");
      setMessage("Check your inbox to confirm Friday's list.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Please try again.");
    }
  }

  if (state === "success") {
    return (
      <div className="friday-signup friday-signup--success" role="status" aria-live="polite">
        <strong>You&apos;re almost on Friday&apos;s list.</strong>
        <small>{message}</small>
      </div>
    );
  }

  return (
    <form className="friday-signup" onSubmit={submit} aria-label="Friday email signup">
      <label htmlFor="friday-email">Email address</label>
      <div>
        <input
          id="friday-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={state === "submitting"}
          required
        />
        <button type="submit" disabled={state === "submitting"}>
          {state === "submitting" ? "Sending…" : "Get the list"}
        </button>
      </div>
      <small className={state === "error" ? "friday-signup__error" : undefined} aria-live="polite">
        {message}
      </small>
    </form>
  );
}
