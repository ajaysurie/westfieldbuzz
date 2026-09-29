"use client";

import { useMemo, useState } from "react";
import {
  SUBSCRIBER_STATUS_LABELS,
  subscribersToCsv,
  type SubscriberCounts,
  type SubscriberListItem,
  type SubscriberStatus,
} from "@/lib/subscribers-admin";

type Filter = SubscriberStatus | "all";

export interface SubscribersData {
  items: SubscriberListItem[];
  counts: SubscriberCounts;
}

/** Rows drawn at once. Counts and the CSV always cover everyone. */
const VISIBLE_ROWS = 500;

function formatDay(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(new Date(iso));
}

/** The Friday list: counts, a status filter, the addresses, and a CSV download. */
export default function SubscribersView({ data }: { data: SubscribersData }) {
  const [filter, setFilter] = useState<Filter>("active");

  const shown = useMemo(
    () => data.items.filter((item) => filter === "all" || item.status === filter),
    [data, filter],
  );

  function download() {
    const blob = new Blob([subscribersToCsv(shown)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const day = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `westfield-buzz-subscribers-${filter}-${day}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const { counts } = data;
  const filters: Array<{ key: Filter; label: string; count: number }> = [
    { key: "active", label: "Active", count: counts.active },
    { key: "pending", label: "Waiting to confirm", count: counts.pending },
    { key: "unsubscribed", label: "Unsubscribed", count: counts.unsubscribed },
    ...(counts.suppressed ? [{ key: "suppressed" as const, label: "Stopped", count: counts.suppressed }] : []),
    { key: "all", label: "Everyone", count: counts.total },
  ];

  return (
    <div>
      <p className="mb-1 text-[2.4rem] leading-none text-ink" style={{ fontFamily: "var(--font-display)" }}>
        {counts.active}
      </p>
      <p className="mb-6 text-[0.85rem] text-ink-muted">
        active subscribers. They get the Friday email.
        {counts.pending > 0 && ` ${counts.pending} more haven't confirmed yet.`}
      </p>

      <div className="category-filters" role="group" aria-label="Filter subscribers">
        {filters.map((option) => (
          <button key={option.key} type="button" aria-pressed={filter === option.key} onClick={() => setFilter(option.key)}>
            {option.label} · {option.count}
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[0.8rem] text-ink-muted">
          {shown.length > VISIBLE_ROWS
            ? `Showing the newest ${VISIBLE_ROWS} of ${shown.length}. The CSV has all ${shown.length}.`
            : `${shown.length} shown`}
        </p>
        <button
          type="button"
          onClick={download}
          disabled={!shown.length}
          className="cursor-pointer rounded-md px-3 py-1.5 text-[0.8rem] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          Download CSV
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="text-[0.85rem] text-ink-muted">No one in this group yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.slice(0, VISIBLE_ROWS).map((item) => (
            <li key={item.email} className="rounded-[10px] border border-black/6 bg-paper-pure px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="break-all text-[0.9rem] text-ink">{item.email}</span>
                <span className="text-[0.75rem] text-ink-muted">
                  {SUBSCRIBER_STATUS_LABELS[item.status]}
                  {item.signedUpAt ? ` · signed up ${formatDay(item.signedUpAt)}` : ""}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
