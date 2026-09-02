import { getPublicEvents } from "@/lib/firestore";
import HomeContent from "./HomeContent";
import type { SerializedHomeEvent } from "./HomeContent";

export const dynamic = "force-dynamic";

function homeWindow(now = new Date()) {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 8);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

export default async function Home() {
  const range = homeWindow();
  const events = await getPublicEvents({ ...range, limit: 80 });
  const initialEvents: SerializedHomeEvent[] = events.map((event) => ({
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    town: event.town,
    category: event.category,
    interestedCount: event.interestedCount,
    createdBy: event.createdBy,
    imageUrl: event.imageUrl,
    status: event.status,
    availability: event.availability,
    publicationStatus: event.publicationStatus,
    freshnessStatus: event.freshnessStatus,
    date: event.date.toDate().toISOString(),
    endDate: event.endDate?.toDate().toISOString() ?? null,
    createdAt: event.createdAt.toDate().toISOString(),
    ...(event.lastVerifiedAt
      ? { lastVerifiedAt: event.lastVerifiedAt.toDate().toISOString() }
      : {}),
  }));
  return <HomeContent initialEvents={initialEvents} />;
}
