"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AdminGate from "@/components/AdminGate";
import { useAuth } from "@/lib/auth";
import { FEEDBACK_REASONS } from "@/lib/feedback";
import type { FeedbackItem } from "@/lib/server/feedback-store";

function formatWhen(iso: string | null): string {
  if (!iso) return "Just now";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" })
    .format(new Date(iso));
}

function FeedbackQueue() {
  const { user } = useAuth();
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setError("");
    try {
      const response = await fetch("/api/admin/feedback", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Could not load feedback.");
      setItems(body.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load feedback.");
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  async function resolve(id: string) {
    if (!user) return;
    const response = await fetch("/api/admin/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify({ id }),
    });
    if (response.ok) setItems((current) => current?.filter((item) => item.id !== id) ?? null);
    else setError("Could not resolve that item. Try again.");
  }

  if (error) return <p className="text-[0.85rem]" style={{ color: "#a33" }}>{error}</p>;
  if (!items) return <p className="text-[0.85rem] text-ink-muted">Loading feedback…</p>;
  if (!items.length) return <p className="text-[0.85rem] text-ink-muted">No open feedback. Nice.</p>;

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <article key={item.id} className="rounded-[10px] border border-black/6 bg-paper-pure p-5">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="rounded-full bg-ink/8 px-3 py-1 text-ink">{FEEDBACK_REASONS[item.reason] ?? item.reason}</span>
            <span className="rounded-full bg-accent/10 px-3 py-1 text-accent">{item.via === "web" ? "Site form" : "Agent"}</span>
            <span className="text-ink-muted">{formatWhen(item.createdAt)}</span>
          </div>
          {item.eventId && (
            <p className="mb-1 text-[0.9rem]">
              <Link href={`/events/${encodeURIComponent(item.eventId)}`} className="text-accent">
                {item.eventTitle ?? item.eventId}
              </Link>
            </p>
          )}
          {item.message && <p className="mb-2 whitespace-pre-wrap text-[0.85rem] text-ink">{item.message}</p>}
          <p className="text-[0.75rem] text-ink-muted">
            {item.contact ? <>Reply to {item.contact} · </> : null}
            {item.via === "agent" && item.userAgent ? item.userAgent : null}
          </p>
          <button
            type="button"
            onClick={() => void resolve(item.id)}
            className="mt-3 cursor-pointer rounded-md px-3 py-1.5 text-[0.8rem] font-medium text-white"
            style={{ background: "var(--accent)" }}
          >
            Mark resolved
          </button>
        </article>
      ))}
    </div>
  );
}

export default function AdminFeedbackPage() {
  return (
    <AdminGate>
      <div className="mx-auto max-w-[720px] px-12 py-12 max-md:px-6">
        <div className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.15em]" style={{ color: "var(--accent)" }}>
          Admin
        </div>
        <h1 className="mb-2" style={{ fontFamily: "var(--font-display)", fontSize: "2rem", fontWeight: 400, color: "var(--ink)" }}>
          Feedback
        </h1>
        <p className="mb-6 text-[0.85rem] text-ink-muted">
          Reports from event pages, the feedback page, and agents. Replies to the Friday email arrive in the inbox instead.
        </p>
        <FeedbackQueue />
      </div>
    </AdminGate>
  );
}
