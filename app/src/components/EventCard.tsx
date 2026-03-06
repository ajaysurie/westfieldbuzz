import type { Event } from "@/lib/firestore";
import type { Timestamp } from "firebase/firestore";

function formatDate(timestamp: Timestamp | null): string {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp as unknown as string);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatTime(timestamp: Timestamp | null): string {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp as unknown as string);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

interface EventCardProps {
  event: Event;
  dark?: boolean;
}

export default function EventCard({ event, dark = false }: EventCardProps) {
  const startTime = formatTime(event.date);
  const endTime = event.endDate ? formatTime(event.endDate) : "";
  const timeRange = endTime ? `${startTime}\u2013${endTime}` : startTime;

  if (dark) {
    return (
      <div className="cursor-pointer rounded-[10px] border border-white/8 p-6 transition-all hover:border-white/15 hover:bg-white/3">
        <div
          className="mb-2 text-[0.85rem]"
          style={{ fontFamily: "var(--font-display)", color: "var(--accent-light)" }}
        >
          {formatDate(event.date)}
        </div>
        <div
          className="mb-1 text-[1.2rem]"
          style={{ fontFamily: "var(--font-display)", color: "var(--paper)" }}
        >
          {event.title}
        </div>
        <div className="text-[0.82rem] text-white/40">
          {event.location}
          {timeRange && ` \u00B7 ${timeRange}`}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[10px] border border-black/6 bg-paper-pure p-6 transition-all hover:shadow-md hover:-translate-y-0.5">
      <div className="mb-1 flex items-start justify-between">
        <div
          className="text-[0.82rem] font-semibold"
          style={{ color: "var(--accent)" }}
        >
          {formatDate(event.date)}
        </div>
        {event.category && (
          <span
            className="rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold text-ink-muted"
            style={{ background: "var(--paper-dark)" }}
          >
            {event.category}
          </span>
        )}
      </div>
      <h3
        className="mb-1 text-[1.1rem]"
        style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--ink)" }}
      >
        {event.title}
      </h3>
      <div className="text-[0.82rem] text-ink-muted">
        {event.location}
        {timeRange && ` \u00B7 ${timeRange}`}
      </div>
      {event.description && (
        <p className="mt-2 text-[0.85rem] text-ink-light line-clamp-2">
          {event.description}
        </p>
      )}
      {event.interestedCount > 0 && (
        <div className="mt-3 text-[0.78rem] text-ink-muted">
          {event.interestedCount} interested
        </div>
      )}
    </div>
  );
}
