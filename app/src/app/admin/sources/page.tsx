"use client";

import { useCallback, useEffect, useState } from "react";
import AdminGate from "@/components/AdminGate";
import {
  getPendingEventCandidates,
  getSourceHealth,
  getSourceCandidates,
  reviewCandidate,
  type PendingEventCandidate,
  type SourceCandidate,
  type SourceHealth,
} from "@/lib/firestore";
import { useAuth } from "@/lib/auth";

function formatTimestamp(value: { toDate?: () => Date } | undefined): string {
  const date = value?.toDate?.();
  if (!date || Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function firstMessage(messages: string[] | undefined): string | null {
  return messages?.find((message) => message.trim()) ?? null;
}

function Counts({ health }: { health: SourceHealth }) {
  const counts = [
    ["Fetched", health.fetched],
    ["Created", health.created],
    ["Updated", health.updated],
    ["Candidates", health.candidates],
  ].filter(([, value]) => typeof value === "number") as [string, number][];

  if (!counts.length) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[0.8rem] sm:grid-cols-4">
      {counts.map(([label, value]) => (
        <div key={label}>
          <dt className="text-ink-muted">{label}</dt>
          <dd className="font-semibold text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SourcesContent() {
  const { user } = useAuth();
  const [health, setHealth] = useState<SourceHealth[]>([]);
  const [candidates, setCandidates] = useState<PendingEventCandidate[]>([]);
  const [sourceCandidates, setSourceCandidates] = useState<SourceCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sourceHealth, pendingCandidates, discoveredSources] = await Promise.all([
        getSourceHealth(),
        getPendingEventCandidates(),
        getSourceCandidates(),
      ]);
      setHealth(sourceHealth);
      setCandidates(pendingCandidates);
      setSourceCandidates(discoveredSources);
    } catch {
      setError("Source records could not be loaded. Check your admin access and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const review = async (kind: "event" | "source", id: string, action: "approve" | "reject" | "suppress" | "resolve") => {
    if (!user) return;
    try {
      await reviewCandidate(await user.getIdToken(), { kind, id, action });
      await load();
    } catch { setError("That review action could not be saved. Please try again."); }
  };

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="px-6 py-12 text-ink-muted">Loading source health…</p>;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[1100px] px-6 py-12">
        <p className="mb-4 text-ink-muted">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-12 sm:px-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.15em] text-accent">Admin</p>
          <h1 className="text-[2rem] text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}>
            Sources & review queue
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Read-only visibility into approved source refreshes and observations held for review.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-black/12 px-4 py-2 text-sm font-semibold text-ink"
        >
          Refresh
        </button>
      </div>

      <section aria-labelledby="source-health-heading" className="mb-12">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 id="source-health-heading" className="text-xl text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}>
            Approved source health
          </h2>
          <span className="text-sm text-ink-muted">{health.length} recorded</span>
        </div>
        {health.length === 0 ? (
          <p className="rounded-[10px] border border-black/6 bg-paper-pure p-5 text-sm text-ink-muted">
            No approved source health has been recorded yet. The next ingestion run will add it here.
          </p>
        ) : (
          <div className="grid gap-4">
            {health.map((source) => {
              const nextExpected = source.nextExpectedRunAt?.toDate?.();
              const overdue = Boolean(nextExpected && nextExpected.getTime() < Date.now());
              const errorMessage = firstMessage(source.errors);
              const warningMessage = firstMessage(source.warnings);
              return (
                <article key={source.id} className="rounded-[10px] border border-black/6 bg-paper-pure p-5">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}>
                        {source.sourceName || source.sourceId}
                      </h3>
                      <p className="text-sm text-ink-muted">{source.group} · {source.sourceId}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-ink/8 px-3 py-1 text-ink">{source.status}</span>
                      {overdue && <span className="rounded-full bg-sienna/15 px-3 py-1 text-sienna">Overdue</span>}
                      {source.safetyHeld && <span className="rounded-full bg-accent/15 px-3 py-1 text-accent">Safety hold</span>}
                    </div>
                  </div>
                  <div className="mb-4 grid gap-2 text-sm text-ink-muted sm:grid-cols-3">
                    <p><span className="font-medium text-ink">Checked:</span> {formatTimestamp(source.checkedAt)}</p>
                    <p><span className="font-medium text-ink">Next expected:</span> {formatTimestamp(source.nextExpectedRunAt)}</p>
                    <p><span className="font-medium text-ink">Consecutive failures:</span> {source.consecutiveFailures ?? 0}</p>
                  </div>
                  <Counts health={source} />
                  {(errorMessage || warningMessage) && (
                    <div className="mt-4 grid gap-2 text-sm">
                      {errorMessage && <p className="rounded bg-sienna/10 p-3 text-sienna"><span className="font-semibold">Error:</span> {errorMessage}</p>}
                      {warningMessage && <p className="rounded bg-accent/10 p-3 text-ink"><span className="font-semibold">Warning:</span> {warningMessage}</p>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="review-queue-heading">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 id="review-queue-heading" className="text-xl text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}>
            Pending event candidates
          </h2>
          <span className="text-sm text-ink-muted">{candidates.length} pending</span>
        </div>
        {candidates.length === 0 ? (
          <p className="rounded-[10px] border border-black/6 bg-paper-pure p-5 text-sm text-ink-muted">
            No observations are awaiting review.
          </p>
        ) : (
          <div className="grid gap-4">
            {candidates.map((candidate) => (
              <article key={candidate.id} className="rounded-[10px] border border-black/6 bg-paper-pure p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}>
                      {candidate.title}
                    </h3>
                    <p className="text-sm text-ink-muted">
                      {candidate.sourceName || candidate.sourceId} · {formatTimestamp(candidate.date)}
                    </p>
                  </div>
                  <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
                    {candidate.reason}
                  </span>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-ink-muted">
                  {candidate.matchingEventIds?.length ? <p><span className="font-medium text-ink">Matching events:</span> {candidate.matchingEventIds.join(", ")}</p> : null}
                  {candidate.matchingSourceIds?.length ? <p><span className="font-medium text-ink">Matching sources:</span> {candidate.matchingSourceIds.join(", ")}</p> : null}
                  {candidate.sourceUrl ? (
                    <a href={candidate.sourceUrl} target="_blank" rel="noreferrer" className="w-fit font-medium text-accent underline underline-offset-2">
                      Open original source
                    </a>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void review("event", candidate.id, "approve")} className="rounded border border-ink/20 px-3 py-2 text-xs font-semibold text-ink">Approve</button>
                  <button type="button" onClick={() => void review("event", candidate.id, "reject")} className="rounded border border-ink/20 px-3 py-2 text-xs font-semibold text-ink">Reject</button>
                  <button type="button" onClick={() => void review("event", candidate.id, "suppress")} className="rounded border border-ink/20 px-3 py-2 text-xs font-semibold text-ink">Suppress</button>
                  <button type="button" onClick={() => void review("event", candidate.id, "resolve")} className="rounded border border-ink/20 px-3 py-2 text-xs font-semibold text-ink">Resolve</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="source-candidates-heading" className="mt-12">
        <h2 id="source-candidates-heading" className="text-xl text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}>Discovered sources</h2>
        <p className="mt-1 text-sm text-ink-muted">Reviewing a source does not enable crawling; approved-source policy stays explicit.</p>
        <div className="mt-4 grid gap-3">
          {sourceCandidates.map((candidate) => <article key={candidate.id} className="rounded-[10px] border border-black/6 bg-paper-pure p-5">
            <p className="font-semibold text-ink">{candidate.name || candidate.host || candidate.id}</p>
            <p className="mt-1 text-sm text-ink-muted">{candidate.reviewStatus}{candidate.reason ? ` · ${candidate.reason}` : ""}</p>
            {candidate.url ? <a className="mt-2 inline-block text-sm text-accent underline" href={candidate.url} target="_blank" rel="noreferrer">Open source</a> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void review("source", candidate.id, "approve")} className="rounded border border-ink/20 px-3 py-2 text-xs font-semibold text-ink">Approve review</button>
              <button type="button" onClick={() => void review("source", candidate.id, "reject")} className="rounded border border-ink/20 px-3 py-2 text-xs font-semibold text-ink">Reject</button>
              <button type="button" onClick={() => void review("source", candidate.id, "suppress")} className="rounded border border-ink/20 px-3 py-2 text-xs font-semibold text-ink">Suppress</button>
            </div>
          </article>)}
          {sourceCandidates.length === 0 ? <p className="rounded-[10px] border border-black/6 bg-paper-pure p-5 text-sm text-ink-muted">No discovered sources are awaiting review.</p> : null}
        </div>
      </section>
    </div>
  );
}

export default function AdminSourcesPage() {
  return (
    <AdminGate>
      <SourcesContent />
    </AdminGate>
  );
}
