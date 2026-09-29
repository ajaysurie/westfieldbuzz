import { handleCalendarFeed } from "./handler";
import { createFirestoreEventRepository } from "@/lib/server/event-query/firestore-event-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleCalendarFeed(request, { repository: createFirestoreEventRepository() });
}
