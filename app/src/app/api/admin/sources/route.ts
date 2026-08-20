import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/server/firebase-admin";
import { EVENT_SOURCES } from "@/lib/server/ingestion/source-registry";
import { loadResolvedSources } from "@/lib/server/ingestion/source-overrides";

async function operator(request: Request): Promise<{ uid: string; email: string } | null> {
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
  if (!token) return null;
  try {
    const identity = await getAdminAuth().verifyIdToken(token, true);
    if (!identity.email_verified || !identity.email) return null;
    const admin = await getAdminDb().collection("config").doc("admin").get();
    const allowlist = admin.data()?.allowlist;
    return Array.isArray(allowlist) && allowlist.includes(identity.email)
      ? { uid: identity.uid, email: identity.email } : null;
  } catch { return null; }
}

/** The current resolved trust and enabled state for every source. */
export async function GET(request: Request) {
  const actor = await operator(request);
  if (!actor) return NextResponse.json({ ok: false, message: "Admin authorization required." }, { status: 403 });
  const { sources, warnings } = await loadResolvedSources(getAdminDb());
  return NextResponse.json({
    ok: true,
    warnings,
    sources: sources.map((source) => ({
      id: source.id,
      name: source.name,
      group: source.group,
      town: source.town,
      publicUrl: source.publicUrl ?? source.url,
      autoApprove: source.autoApprove,
      enabled: source.enabled,
    })),
  });
}

const KNOWN_IDS = new Set(EVENT_SOURCES.map((source) => source.id));

/**
 * Set operator-controlled fields for one source. Merges into config/sources so
 * a single toggle does not disturb other sources' overrides.
 */
export async function POST(request: Request) {
  const actor = await operator(request);
  if (!actor) return NextResponse.json({ ok: false, message: "Admin authorization required." }, { status: 403 });

  let body: { id?: string; autoApprove?: boolean; enabled?: boolean };
  try { body = await request.json(); } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }
  if (!body?.id || !KNOWN_IDS.has(body.id)) {
    return NextResponse.json({ ok: false, message: "Unknown source id." }, { status: 400 });
  }
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid };
  if (typeof body.autoApprove === "boolean") patch.autoApprove = body.autoApprove;
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (Object.keys(patch).length === 2) {
    return NextResponse.json({ ok: false, message: "Nothing to change." }, { status: 400 });
  }

  await getAdminDb().collection("config").doc("sources").set(
    { overrides: { [body.id]: patch } },
    { merge: true }
  );
  return NextResponse.json({ ok: true, id: body.id });
}
