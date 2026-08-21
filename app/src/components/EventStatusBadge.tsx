interface EventStatusBadgeProps {
  status?: string;
  availability?: string;
  freshness?: string;
  compact?: boolean;
}

type StatusPresentation = {
  label: string;
  tone: "good" | "warning" | "danger" | "muted";
};

export function getEventStatusPresentation({
  status,
  availability,
  freshness,
}: Omit<EventStatusBadgeProps, "compact">): StatusPresentation {
  if (status === "cancelled") return { label: "Cancelled", tone: "danger" };
  if (availability === "sold-out") return { label: "Sold out", tone: "danger" };
  if (availability === "waitlist") return { label: "Waitlist", tone: "warning" };
  if (status === "rescheduled") return { label: "Time changed", tone: "warning" };
  if (status === "postponed") return { label: "Postponed", tone: "warning" };
  if (status === "weather-dependent") {
    return { label: "Weather dependent", tone: "warning" };
  }
  if (freshness === "stale") return { label: "Needs rechecking", tone: "muted" };
  if (freshness === "missing") return { label: "Recently changed", tone: "warning" };
  if (availability === "registration-required") {
    return { label: "Registration required", tone: "good" };
  }
  return { label: "Scheduled", tone: "good" };
}

export default function EventStatusBadge(props: EventStatusBadgeProps) {
  const presentation = getEventStatusPresentation(props);

  return (
    <span
      className={`event-status event-status--${presentation.tone}${props.compact ? " event-status--compact" : ""}`}
    >
      <span className="event-status__dot" aria-hidden="true" />
      {presentation.label}
    </span>
  );
}
