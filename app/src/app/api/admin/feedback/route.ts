import { NextResponse } from "next/server";
import { adminOperator } from "@/lib/server/admin-operator";
import { listOpenFeedback, resolveFeedback } from "@/lib/server/feedback-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORBIDDEN = { ok: false, message: "Admin authorization required." };

export async function GET(request: Request) {
  if (!(await adminOperator(request))) return NextResponse.json(FORBIDDEN, { status: 403 });
  return NextResponse.json({ ok: true, items: await listOpenFeedback() });
}

/** Mark one feedback item resolved. */
export async function POST(request: Request) {
  const actor = await adminOperator(request);
  if (!actor) return NextResponse.json(FORBIDDEN, { status: 403 });
  let body: { id?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }
  if (typeof body?.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(body.id)) {
    return NextResponse.json({ ok: false, message: "Invalid feedback id." }, { status: 400 });
  }
  if (!(await resolveFeedback(body.id, actor.uid))) {
    return NextResponse.json({ ok: false, message: "Feedback not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
