"use client";

import Link from "next/link";
import { useState } from "react";
import AdminGate from "@/components/AdminGate";
import { useAuth } from "@/lib/auth";
import { sendTestDigest } from "@/lib/firestore";

function DigestTest() {
  const { user } = useAuth();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "held" | "error">("idle");
  const [detail, setDetail] = useState("");

  async function handleSend() {
    if (!user) return;
    setState("sending");
    setDetail("");
    try {
      const result = await sendTestDigest(await user.getIdToken());
      if (result.ok) {
        setState("sent");
        setDetail(`${result.issueLabel} — ${result.events} events, sent to ${user.email}`);
      } else {
        setState("held");
        setDetail(`This week's edition is held: ${result.holdReason ?? "no sendable inventory"}.`);
      }
    } catch {
      setState("error");
      setDetail("The test email could not be sent. Try again.");
    }
  }

  return (
    <div className="rounded-[10px] border border-black/6 bg-paper-pure p-6">
      <h3
        className="mb-1 text-[1.1rem]"
        style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--ink)" }}
      >
        Friday digest test
      </h3>
      <p className="mb-4 text-[0.85rem] text-ink-muted">
        Send this week&rsquo;s edition to your own address — same events and layout as Friday&rsquo;s send.
      </p>
      <button
        type="button"
        onClick={() => void handleSend()}
        disabled={state === "sending"}
        className="cursor-pointer rounded-md px-4 py-2 text-[0.85rem] font-medium text-white disabled:opacity-60"
        style={{ background: "var(--accent)" }}
      >
        {state === "sending" ? "Sending..." : "Email me the digest"}
      </button>
      {detail && (
        <p className="mt-3 text-[0.8rem]" style={{ color: state === "error" || state === "held" ? "#a33" : "var(--ink-light)" }}>
          {detail}
        </p>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <AdminGate>
      <div className="mx-auto max-w-[600px] px-12 py-12 max-md:px-6">
        <div
          className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.15em]"
          style={{ color: "var(--accent)" }}
        >
          Admin
        </div>
        <h1
          className="mb-8"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "2rem",
            fontWeight: 400,
            color: "var(--ink)",
          }}
        >
          Dashboard
        </h1>

        <div className="flex flex-col gap-4">
          <DigestTest />

          <Link
            href="/admin/events"
            className="rounded-[10px] border border-black/6 bg-paper-pure p-6 no-underline transition-all hover:shadow-md"
          >
            <h3
              className="mb-1 text-[1.1rem]"
              style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--ink)" }}
            >
              Manage Events
            </h3>
            <p className="text-[0.85rem] text-ink-muted">
              Add, edit, and remove community events
            </p>
          </Link>
        </div>
      </div>
    </AdminGate>
  );
}
