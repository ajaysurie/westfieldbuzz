import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/server/firebase-admin";

type CandidateKind = "event" | "source";
type ReviewAction = "approve" | "reject" | "suppress" | "resolve";

function bearer(request: Request): string | null {
  return /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
}

async function operator(request: Request): Promise<{ uid: string; email: string } | null> {
  const token = bearer(request);
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

export async function POST(request: Request) {
  const actor = await operator(request);
  if (!actor) return NextResponse.json({ ok: false, message: "Admin authorization required." }, { status: 403 });
  let body: { kind?: CandidateKind; id?: string; action?: ReviewAction; note?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, message: "Invalid review request." }, { status: 400 }); }
  if (!body || (body.kind !== "event" && body.kind !== "source") || !body.id || !/^[A-Za-z0-9_-]{1,180}$/.test(body.id)
    || !["approve", "reject", "suppress", "resolve"].includes(body.action ?? "")) {
    return NextResponse.json({ ok: false, message: "Invalid review request." }, { status: 400 });
  }
  const collection = body.kind === "event" ? "eventCandidates" : "sourceCandidates";
  const ref = getAdminDb().collection(collection).doc(body.id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return NextResponse.json({ ok: false, message: "Candidate not found." }, { status: 404 });
  const status = body.action === "approve" ? "approved" : body.action === "reject" ? "rejected"
    : body.action === "suppress" ? "suppressed" : "resolved";
  await ref.set({
    reviewStatus: status,
    reviewedAt: FieldValue.serverTimestamp(),
    reviewedBy: actor.uid,
    reviewedByEmail: actor.email,
    ...(body.note?.trim() ? { reviewNotes: body.note.trim().slice(0, 500) } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  // Deliberately no eventSources write here. A discovered source being
  // approved means reviewed, not trusted to crawl; adding crawl policy remains
  // an explicit configuration/repository change.
  return NextResponse.json({ ok: true, kind: body.kind, id: body.id, reviewStatus: status });
}
