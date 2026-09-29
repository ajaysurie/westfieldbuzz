import { handleFeedback } from "./handler";
import { createFirestoreFeedbackDeps } from "@/lib/server/feedback-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleFeedback(request, createFirestoreFeedbackDeps());
}
