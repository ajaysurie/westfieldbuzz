import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/server/firebase-admin";
import {
  transitionEventCandidate,
  type CandidateReviewStatus,
} from "@/lib/server/ingestion/candidate-lifecycle";

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
  // Event candidates go through the lifecycle transition, which validates the
  // state machine and creates the published event in the same transaction.
  // Stamping reviewStatus directly would mark a candidate approved while never
  // publishing anything.
  if (body.kind === "event") {
    const target: CandidateReviewStatus | null = body.action === "approve" ? "approved"
      : body.action === "reject" ? "rejected"
        : body.action === "suppress" ? "suppressed" : null;
    if (!target) {
      return NextResponse.json(
        { ok: false, message: "Event candidates accept approve, reject, or suppress." },
        { status: 400 }
      );
    }
    try {
      const outcome = await transitionEventCandidate({
        db: getAdminDb(),
        candidateId: body.id,
        to: target,
        reviewer: actor.uid,
        ...(body.note?.trim() ? { note: body.note.trim().slice(0, 500) } : {}),
      });
      return NextResponse.json({
        ok: true,
        kind: body.kind,
        id: body.id,
        reviewStatus: outcome.status,
        ...(outcome.eventId ? { eventId: outcome.eventId } : {}),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason === "candidate-not-found") {
        return NextResponse.json({ ok: false, message: "Candidate not found." }, { status: 404 });
      }
      if (reason === "invalid-candidate-transition") {
        return NextResponse.json(
          { ok: false, message: "That review transition is not allowed from the candidate's current status." },
          { status: 409 }
        );
      }
      throw error;
    }
  }

  const collection = "sourceCandidates";
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
  // approved means reviewed, not trusted to crawl; crawl trust is a separate
  // explicit decision (see /api/admin/source-trust).
  return NextResponse.json({ ok: true, kind: body.kind, id: body.id, reviewStatus: status });
}
