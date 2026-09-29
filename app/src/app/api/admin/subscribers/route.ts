import { NextResponse } from "next/server";
import { adminOperator } from "@/lib/server/admin-operator";
import { listSubscribers } from "@/lib/server/subscribers-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The Friday list, for the admin page. Email addresses are personal data: admins only, never cached. */
export async function GET(request: Request) {
  if (!(await adminOperator(request))) {
    return NextResponse.json({ ok: false, message: "Admin authorization required." }, { status: 403 });
  }
  try {
    const list = await listSubscribers();
    return NextResponse.json({ ok: true, ...list }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, message: "The subscriber list could not be loaded." }, { status: 503 });
  }
}
