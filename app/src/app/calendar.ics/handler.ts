import { MAX_LIMIT, queryPublicEvents, type PublicEventsDeps } from "@/app/api/events/handler";
import { buildCalendar } from "@/lib/events/ical";

/**
 * GET /calendar.ics — subscribable iCalendar feed of upcoming events. Takes
 * the same town, category, from, to, and limit params as /api/events.
 */
export async function handleCalendarFeed(request: Request, deps: PublicEventsDeps): Promise<Response> {
  const url = new URL(request.url);
  const result = await queryPublicEvents(url, deps, MAX_LIMIT);
  if (!result.ok) return result.response;

  const scope = [url.searchParams.get("category"), url.searchParams.get("town")].filter(Boolean).join(" in ");
  const calendar = buildCalendar(
    result.events.map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      start: new Date(event.date),
      end: event.endDate ? new Date(event.endDate) : null,
      location: event.location,
      town: event.town,
      sourceUrl: event.sourceUrl,
      cancelled: event.status === "cancelled",
    })),
    { name: scope ? `Westfield Buzz: ${scope}` : "Westfield Buzz", generatedAt: deps.now },
  );

  return new Response(calendar, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="westfield-buzz.ics"',
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
