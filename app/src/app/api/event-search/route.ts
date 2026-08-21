import { handleEventSearch } from "./handler";

export const runtime = "nodejs";
// Intent parse and narrative composition are sequential model calls.
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleEventSearch(request);
}
