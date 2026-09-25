import type { MetadataRoute } from "next";
import { createFirestoreEventRepository } from "@/lib/server/event-query/firestore-event-repository";
import { eventPageUrl } from "@/lib/seo/event-jsonld";
import { DEFAULT_SEARCH_HORIZON_DAYS } from "@/lib/search/event-retrieval";

const BASE_URL = "https://westfieldbuzz.com";

const STATIC_ROUTES: MetadataRoute.Sitemap = [
  { url: BASE_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
  { url: `${BASE_URL}/events`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
  { url: `${BASE_URL}/search`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
  { url: `${BASE_URL}/sources`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.4 },
  { url: `${BASE_URL}/agents`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.4 },
  { url: `${BASE_URL}/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
  { url: `${BASE_URL}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.2 },
  { url: `${BASE_URL}/data-deletion`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.2 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const repository = createFirestoreEventRepository();
    const now = new Date();
    const horizon = new Date(now);
    horizon.setUTCDate(horizon.getUTCDate() + DEFAULT_SEARCH_HORIZON_DAYS);
    const events = await repository.listPublishedEvents({ from: now, to: horizon, limit: 1000 });
    const eventEntries: MetadataRoute.Sitemap = events.map((event) => ({
      url: eventPageUrl(event.id, BASE_URL),
      lastModified: new Date(event.lastVerifiedAt),
      changeFrequency: "daily",
      priority: 0.7,
    }));
    return [...STATIC_ROUTES, ...eventEntries];
  } catch {
    // Admin credentials are absent in local dev; crawlers still get the static routes.
    return STATIC_ROUTES;
  }
}
