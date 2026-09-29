"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import EventDetailActions from "@/components/EventDetailActions";
import FeedbackForm from "@/components/FeedbackForm";
import EventStatusBadge, { hasNoteworthyStatus } from "@/components/EventStatusBadge";
import { formatEventDate, formatEventTime } from "@/components/EventCard";
import { getPublishedEventById, type Event } from "@/lib/firestore";
import { formatTimeRange, townSuffix } from "@/lib/events/display-text";
import { costAndAgeLabel } from "@/lib/events/doc-facts";

function dateValue(value: Event["lastVerifiedAt"]): Date | null {
  if (!value) return null;
  return value.toDate ? value.toDate() : new Date(value as unknown as string);
}

function DetailState({
  title,
  children,
  retry,
}: {
  title: string;
  children: React.ReactNode;
  retry?: () => void;
}) {
  return (
    <div className="detail-shell detail-state">
      <p className="eyebrow">Westfield Buzz calendar</p>
      <h1>{title}</h1>
      <p>{children}</p>
      {retry ? <button type="button" onClick={retry}>Try again</button> : <Link href="/events">Back to the calendar</Link>}
    </div>
  );
}

export default function EventDetailClient({ id }: { id: string }) {
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadEvent = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setEvent(await getPublishedEventById(id));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  if (loading) {
    return <DetailState title="Checking this event">Loading its latest published details and source status.</DetailState>;
  }
  if (error) {
    return <DetailState title="This event did not load" retry={() => void loadEvent()}>The calendar request failed. You can retry without signing in.</DetailState>;
  }
  if (!event) {
    return <DetailState title="This event is not available">It may have been removed, unpublished, or given a new calendar listing.</DetailState>;
  }

  const timeRange = formatTimeRange(formatEventTime(event.date), formatEventTime(event.endDate));
  const when = [formatEventDate(event.date), timeRange].filter(Boolean).join(" · ");
  const town = townSuffix(event.location, event.town);
  const where = [event.location, town].filter(Boolean).join(", ") || event.town || "Venue to be confirmed";
  const costAndAge = costAndAgeLabel({
    isFree: event.isFree ?? null,
    costAmount: event.costAmount ?? null,
    minAge: event.minAge ?? null,
    maxAge: event.maxAge ?? null,
  });
  const statusProps = { status: event.status, availability: event.availability, freshness: event.freshnessStatus };
  const hasPhoto = typeof event.imageUrl === "string" && /^https?:\/\//i.test(event.imageUrl);
  const verified = dateValue(event.lastVerifiedAt);
  const sourceHost = event.sourceUrl
    ? (() => {
        try { return new URL(event.sourceUrl).hostname.replace(/^www\./, ""); }
        catch { return "Original listing"; }
      })()
    : "Source pending";
  const mapQuery = encodeURIComponent([event.location, event.town, "NJ"].filter(Boolean).join(", "));

  return (
    <div className="detail-stage">
      <div className="detail-shell">
        <Link href="/events" className="detail-back"><span aria-hidden="true">←</span> Back to calendar</Link>
        <div className="detail-grid">
          <article className="detail-main">
            {hasPhoto && (
              <div className="detail-hero">
                {/* Source photos come from many venue CDNs; see EventCard. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={event.imageUrl} alt="" aria-hidden="true" />
                <span>{event.town || "Around Westfield"}</span>
              </div>
            )}
            <div className="detail-content">
              {hasNoteworthyStatus(statusProps) && <EventStatusBadge {...statusProps} />}
              <h1>{event.title}</h1>
              <p className="detail-when">{when}</p>
              <p className="detail-where">{where}</p>
              {event.description && <p className="detail-summary">{event.description}</p>}

              <EventDetailActions event={event} />

              <dl className="detail-facts">
                <div><dt>Date</dt><dd>{formatEventDate(event.date)}</dd></div>
                <div><dt>Time</dt><dd>{timeRange || "Time to be confirmed"}</dd></div>
                <div><dt>Venue</dt><dd>{event.location || "Venue to be confirmed"}</dd></div>
                <div><dt>Town</dt><dd>{event.town || "Westfield area"}</dd></div>
                <div><dt>Category</dt><dd>{event.category || "Community"}</dd></div>
                <div><dt>Cost & audience</dt><dd>{costAndAge || "Not listed by the source"}</dd></div>
              </dl>

              <section className="detail-description" aria-labelledby="about-event">
                <h2 id="about-event">Before you go</h2>
                <p>
                  Event details can change. Check the original listing before leaving,
                  especially when registration, weather, or limited capacity may apply.
                </p>
              </section>

              <details className="detail-feedback">
                <summary>Something wrong with this listing?</summary>
                <FeedbackForm eventId={event.id} />
              </details>
            </div>
          </article>

          <aside className="detail-side" aria-label="Event source and location">
            <section className="detail-side-card">
              <p className="eyebrow">Source & freshness</p>
              <h2>Event source</h2>
              <p>
                {verified
                  ? `Last verified ${verified.toLocaleString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}.`
                  : "This listing is awaiting a recorded verification time."}
              </p>
              {event.sourceUrl ? (
                <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className="source-link">
                  View on {sourceHost} <span aria-hidden="true">↗</span>
                </a>
              ) : (
                <p className="source-unavailable">The original source link is not available.</p>
              )}
            </section>

            <section className="detail-side-card detail-map">
              <div>
                <h2>{event.location || "Venue to be confirmed"}</h2>
                <p>{event.town || "Westfield area"}, New Jersey</p>
                {event.location && (
                  <a href={`https://maps.google.com/?q=${mapQuery}`} target="_blank" rel="noopener noreferrer">
                    Open directions <span aria-hidden="true">↗</span>
                  </a>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
