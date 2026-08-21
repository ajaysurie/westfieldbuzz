"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ConfirmSubscription({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<"ready" | "working" | "error">(
    token ? "ready" : "error"
  );

  async function confirm() {
    setState("working");
    try {
      const response = await fetch("/api/subscriptions/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error("Confirmation failed");
      router.replace(`/subscribe/confirmed?status=${encodeURIComponent(body.status)}`);
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <h1>{state === "error" ? "That link couldn't be confirmed." : "Confirm Friday's list?"}</h1>
      <p>
        {state === "error"
          ? "The link may have expired, or the service may be temporarily unavailable. You can submit your email again from the homepage."
          : "Confirm that you want one concise list of fresh events around Westfield every Friday."}
      </p>
      {state !== "error" ? (
        <button className="btn btn-primary" type="button" onClick={confirm} disabled={state === "working"}>
          {state === "working" ? "Confirming…" : "Confirm my Friday list"}
        </button>
      ) : null}
    </>
  );
}
