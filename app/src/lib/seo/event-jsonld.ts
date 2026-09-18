import type { SearchableEvent } from "@/lib/search/event-retrieval";

/**
 * schema.org Event JSON-LD for a published event. Kept as a pure builder so
 * crawlers and agents get the same structured facts the page renders.
 */
export interface EventJsonLd {
  "@context": "https://schema.org";
  "@type": "Event";
  name: string;
  description?: string;
  startDate: string;
  endDate?: string;
  eventStatus: string;
  eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode";
  url: string;
  location: {
    "@type": "Place";
    name: string;
    address: {
      "@type": "PostalAddress";
      streetAddress?: string;
      addressLocality: string;
      addressRegion: "NJ";
    };
  };
  image?: string;
}

const STATUS_TO_SCHEMA: Record<SearchableEvent["status"], string> = {
  scheduled: "https://schema.org/EventScheduled",
  cancelled: "https://schema.org/EventCancelled",
  postponed: "https://schema.org/EventPostponed",
  rescheduled: "https://schema.org/EventRescheduled",
  // schema.org has no weather-contingent status; keep it scheduled and let the
  // human-readable page carry the nuance.
  "weather-dependent": "https://schema.org/EventScheduled",
};

export function eventPageUrl(id: string, siteOrigin = "https://westfieldbuzz.com"): string {
  return `${siteOrigin}/events/${encodeURIComponent(id)}`;
}

export function buildEventJsonLd(
  event: Pick<
    SearchableEvent,
    "id" | "title" | "description" | "date" | "endDate" | "location" | "town" | "status" | "sourceUrl" | "imageUrl"
  >,
  siteOrigin = "https://westfieldbuzz.com",
): EventJsonLd {
  const locationName = event.location?.trim() || event.town?.trim() || "Westfield area";
  const jsonLd: EventJsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: event.date,
    eventStatus: STATUS_TO_SCHEMA[event.status] ?? STATUS_TO_SCHEMA.scheduled,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: eventPageUrl(event.id, siteOrigin),
    location: {
      "@type": "Place",
      name: locationName,
      address: {
        "@type": "PostalAddress",
        addressLocality: event.town?.trim() || "Westfield",
        addressRegion: "NJ",
      },
    },
  };
  const description = event.description?.trim();
  if (description) jsonLd.description = description.slice(0, 500);
  if (event.endDate) jsonLd.endDate = event.endDate;
  if (event.imageUrl) jsonLd.image = event.imageUrl;
  return jsonLd;
}
