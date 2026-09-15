import type { Metadata } from "next";
import EventDetailClient from "./EventDetailClient";
import { getPublishedEventById } from "@/lib/server/event-query/firestore-event-repository";

type Props = { params: Promise<{ id: string }> };

function eventWhen(dateIso: string): string {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = decodeURIComponent((await params).id);
  try {
    const event = await getPublishedEventById(id);
    if (!event) {
      return { title: "Event not available", robots: { index: false } };
    }
    const when = eventWhen(event.date);
    const place = [event.location, event.town].filter(Boolean).join(", ");
    const description = event.description
      ? event.description.slice(0, 180)
      : `${when} · ${place || "Around Westfield"}`;
    return {
      title: event.title,
      description,
      openGraph: {
        title: event.title,
        description,
        type: "website",
      },
    };
  } catch {
    // Admin credentials are absent in local dev; fall back to site metadata.
    return {};
  }
}

export default async function EventDetailPage({ params }: Props) {
  const { id } = await params;
  return <EventDetailClient id={decodeURIComponent(id)} />;
}
