import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/server/firebase-admin";
import { saveAndLinkPreferences, validatePreferences } from "@/lib/server/account/preferences";

function bearerToken(request: Request): string | null {
  const value = request.headers.get("authorization") ?? "";
  return /^Bearer\s+(.+)$/i.exec(value)?.[1] ?? null;
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ ok: false, message: "Sign in to save preferences." }, { status: 401 });
  let decoded: { uid: string; email?: string; email_verified?: boolean };
  try {
    decoded = await getAdminAuth().verifyIdToken(token, true);
  } catch {
    return NextResponse.json({ ok: false, message: "Your sign-in expired. Please sign in again." }, { status: 401 });
  }
  if (!decoded.email_verified || !decoded.email) {
    return NextResponse.json({ ok: false, message: "Verify your email before saving preferences." }, { status: 403 });
  }
  let body: { preferences?: unknown; reconcile?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Preferences were invalid." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, message: "Preferences were invalid." }, { status: 400 });
  }
  const preferences = body.preferences === undefined ? undefined : validatePreferences(body.preferences);
  if ((body.preferences !== undefined && !preferences) || (body.preferences === undefined && body.reconcile !== true)) {
    return NextResponse.json({ ok: false, message: "Preferences were invalid." }, { status: 400 });
  }
  try {
    const result = await saveAndLinkPreferences({
      db: getAdminDb(),
      account: { uid: decoded.uid, email: decoded.email.trim().toLowerCase() },
      preferences: preferences ?? undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Preference save failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, message: "We could not save your preferences." }, { status: 503 });
  }
}
