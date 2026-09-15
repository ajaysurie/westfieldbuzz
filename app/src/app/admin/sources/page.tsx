"use client";

import { useCallback, useEffect, useState } from "react";
import AdminGate from "@/components/AdminGate";
import {
  getSourceHealth,
  getSourceCandidates,
  reviewCandidate,
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

function isOverdue(source: SourceHealth): boolean {
  const nextExpected = source.nextExpectedRunAt?.toDate?.();
  return Boolean(nextExpected && nextExpected.getTime() < Date.now());
}

/** A source is an exception when it failed, is behind schedule, produced a
 * safety hold, or logged an error — everything else is routine noise. */
function isException(source: SourceHealth): boolean {
  return (
    source.status !== "success" ||
    (source.consecutiveFailures ?? 0) > 0 ||
    isOverdue(source) ||
    source.safetyHeld === true ||
    (source.errors?.length ?? 0) > 0
  );
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

function SourceCard({ source }: { source: SourceHealth }) {
  const errorMessage = firstMessage(source.errors);
  const warningMessage = firstMessage(source.warnings);
  return (
    <article className="rounded-[10px] border border-black/6 bg-paper-pure p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}>
            {source.sourceName || source.sourceId}
          </h3>
          <p className="text-sm text-ink-muted">{source.group} · {source.sourceId}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-ink/8 px-3 py-1 text-ink">{source.status}</span>
          {isOverdue(source) && <span className="rounded-full bg-sienna/15 px-3 py-1 text-sienna">Overdue</span>}
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
}

function SourcesContent() {
  const { user } = useAuth();
  const [health, setHealth] = useState<SourceHealth[]>([]);
  const [sourceCandidates, setSourceCandidates] = useState<SourceCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sourceHealth, discoveredSources] = await Promise.all([
        getSourceHealth(),
        getSourceCandidates(),
      ]);
      setHealth(sourceHealth);
      setSourceCandidates(discoveredSources);
    } catch {
      setError("Source records could not be loaded. Check your admin access and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const review = async (id: string, action: "approve" | "reject" | "suppress" | "resolve") => {
    if (!user) return;
    try {
      await reviewCandidate(await user.getIdToken(), { kind: "source", id, action });
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

  const exceptions = health.filter(isException);
  const routine = health.filter((source) => !isException(source));

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-12 sm:px-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.15em] text-accent">Admin</p>
          <h1 className="text-[2rem] text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}>
            Source health
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Ingestion publishes automatically. Only problems surface here — failures, overdue runs, and safety holds.
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

      <section aria-labelledby="exceptions-heading" className="mb-12">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 id="exceptions-heading" className="text-xl text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}>
            Needs attention
          </h2>
          <span className="text-sm text-ink-muted">{exceptions.length} of {health.length}</span>
        </div>
        {exceptions.length === 0 ? (
          <p className="rounded-[10px] border border-black/6 bg-paper-pure p-5 text-sm text-ink-muted">
            Every recorded source is healthy.
          </p>
        ) : (
          <div className="grid gap-4">
            {exceptions.map((source) => <SourceCard key={source.id} source={source} />)}
          </div>
        )}
      </section>

      <section aria-labelledby="routine-heading" className="mb-12">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 id="routine-heading" className="text-xl text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}>
            Healthy sources
          </h2>
          <span className="text-sm text-ink-muted">{routine.length} recorded</span>
        </div>
        {routine.length === 0 ? (
          <p className="rounded-[10px] border border-black/6 bg-paper-pure p-5 text-sm text-ink-muted">
            No healthy sources recorded yet.
          </p>
        ) : (
          <div className="grid gap-4">
            {routine.map((source) => <SourceCard key={source.id} source={source} />)}
          </div>
        )}
      </section>

      <section aria-labelledby="source-candidates-heading">
        <h2 id="source-candidates-heading" className="text-xl text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}>Discovered sources</h2>
        <p className="mt-1 text-sm text-ink-muted">New sources found by discovery. Approving a review does not enable crawling.</p>
        <div className="mt-4 grid gap-3">
          {sourceCandidates.map((candidate) => <article key={candidate.id} className="rounded-[10px] border border-black/6 bg-paper-pure p-5">
            <p className="font-semibold text-ink">{candidate.name || candidate.host || candidate.id}</p>
            <p className="mt-1 text-sm text-ink-muted">{candidate.reviewStatus}{candidate.reason ? ` · ${candidate.reason}` : ""}</p>
            {candidate.url ? <a className="mt-2 inline-block text-sm text-accent underline" href={candidate.url} target="_blank" rel="noreferrer">Open source</a> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void review(candidate.id, "approve")} className="rounded border border-ink/20 px-3 py-2 text-xs font-semibold text-ink">Approve review</button>
              <button type="button" onClick={() => void review(candidate.id, "reject")} className="rounded border border-ink/20 px-3 py-2 text-xs font-semibold text-ink">Reject</button>
              <button type="button" onClick={() => void review(candidate.id, "suppress")} className="rounded border border-ink/20 px-3 py-2 text-xs font-semibold text-ink">Suppress</button>
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
