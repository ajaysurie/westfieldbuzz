"use client";

import { useEffect, useState } from "react";
import AdminGate from "@/components/AdminGate";
import {
  getSuggestions,
  approveSuggestion,
  rejectSuggestion,
  type SuggestedService,
} from "@/lib/firestore";

export default function AdminSuggestionsPage() {
  return (
    <AdminGate>
      <SuggestionsContent />
    </AdminGate>
  );
}

function SuggestionsContent() {
  const [suggestions, setSuggestions] = useState<SuggestedService[]>([]);
  const [filter, setFilter] = useState<string>("pending");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSuggestions();
  }, [filter]);

  async function loadSuggestions() {
    setLoading(true);
    const data = await getSuggestions(filter || undefined);
    setSuggestions(data);
    setLoading(false);
  }

  async function handleApprove(suggestion: SuggestedService) {
    await approveSuggestion(suggestion);
    loadSuggestions();
  }

  async function handleReject(id: string) {
    await rejectSuggestion(id);
    loadSuggestions();
  }

  return (
    <div className="mx-auto max-w-[800px] px-12 py-12 max-md:px-6">
      <div
        className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.15em]"
        style={{ color: "var(--accent)" }}
      >
        Admin
      </div>
      <h1
        className="mb-6"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.8rem",
          fontWeight: 400,
          color: "var(--ink)",
        }}
      >
        Review Suggestions
      </h1>

      <div className="mb-6 flex gap-2">
        {["pending", "approved", "rejected"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full border px-4 py-1.5 text-[0.8rem] font-medium capitalize transition-all ${
              filter === s
                ? "border-accent bg-accent/10 text-accent"
                : "border-black/10 text-ink-light hover:border-accent hover:text-accent"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-ink-muted">Loading...</p>
      ) : suggestions.length === 0 ? (
        <p className="text-ink-muted">No {filter} suggestions.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {suggestions.map((s) => (
            <div
              key={s.id}
              className="rounded-[10px] border border-black/6 bg-paper-pure p-6"
            >
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <h3
                    className="text-[1.05rem]"
                    style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
                  >
                    {s.businessName}
                  </h3>
                  <span className="text-[0.8rem] text-ink-muted">{s.category}</span>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[0.72rem] font-semibold capitalize ${
                    s.status === "pending"
                      ? "bg-accent/10 text-accent"
                      : s.status === "approved"
                        ? "bg-sage/10 text-sage"
                        : "bg-sienna/10 text-sienna"
                  }`}
                >
                  {s.status}
                </span>
              </div>

              {s.phone && (
                <p className="text-[0.85rem] text-ink-light">Phone: {s.phone}</p>
              )}
              {s.website && (
                <p className="text-[0.85rem] text-ink-light">Website: {s.website}</p>
              )}
              {s.notes && (
                <p className="mt-2 text-[0.85rem] italic text-ink-light">
                  &ldquo;{s.notes}&rdquo;
                </p>
              )}

              {s.status === "pending" && (
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => handleApprove(s)}
                    className="rounded-lg px-4 py-2 text-[0.82rem] font-semibold text-white transition-all"
                    style={{ background: "var(--sage)" }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(s.id)}
                    className="rounded-lg border border-black/12 px-4 py-2 text-[0.82rem] font-medium text-ink-light transition-all hover:text-sienna"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
