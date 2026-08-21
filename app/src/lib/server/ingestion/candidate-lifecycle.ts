import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";

export const CANDIDATE_REVIEW_STATUSES = [
  "pending", "approved", "rejected", "suppressed", "superseded", "reopened",
] as const;
export type CandidateReviewStatus = (typeof CANDIDATE_REVIEW_STATUSES)[number];

const TRANSITIONS: Record<CandidateReviewStatus, CandidateReviewStatus[]> = {
  pending: ["approved", "rejected", "suppressed"],
  approved: ["superseded", "suppressed"],
  rejected: ["reopened"],
  suppressed: ["reopened"],
  superseded: ["reopened"],
  reopened: ["approved", "rejected", "suppressed"],
};

export function canTransitionCandidate(
  from: CandidateReviewStatus,
  to: CandidateReviewStatus
): boolean {
  return TRANSITIONS[from].includes(to);
}

function string(data: Record<string, unknown>, key: string): string {
  return typeof data[key] === "string" ? data[key].trim() : "";
}

function date(data: Record<string, unknown>, key: string, fallback: Date): Date {
  const value = data[key];
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate();
  }
  return fallback;
}

/**
 * Server-only review transition. The candidate retains source evidence and
 * fingerprint fields verbatim; a machine refresh is never allowed to alter
 * reviewer fields or transition a resolved candidate.
 */
export async function transitionEventCandidate(input: {
  db: Firestore;
  candidateId: string;
  to: CandidateReviewStatus;
  reviewer: string;
  note?: string;
  now?: Date;
}): Promise<{ status: CandidateReviewStatus; eventId?: string }> {
  const now = input.now ?? new Date();
  const candidateRef = input.db.collection("eventCandidates").doc(input.candidateId);
  return input.db.runTransaction(async (transaction) => {
    const candidate = await transaction.get(candidateRef);
    if (!candidate.exists) throw new Error("candidate-not-found");
    const data = candidate.data() ?? {};
    const current = CANDIDATE_REVIEW_STATUSES.includes(data.reviewStatus as CandidateReviewStatus)
      ? data.reviewStatus as CandidateReviewStatus
      : "pending";
    if (!canTransitionCandidate(current, input.to)) throw new Error("invalid-candidate-transition");

    const reviewerFields = {
      reviewStatus: input.to,
      reviewedBy: input.reviewer,
      reviewedAt: Timestamp.fromDate(now),
      ...(input.note?.trim() ? { reviewNotes: input.note.trim() } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    };

    let eventId: string | undefined;
    if (input.to === "approved") {
      eventId = string(data, "eventId") || input.candidateId;
      const eventRef = input.db.collection("events").doc(eventId);
      transaction.set(eventRef, {
        title: string(data, "title"),
        description: string(data, "description"),
        date: Timestamp.fromDate(date(data, "date", now)),
        endDate: data.endDate ? Timestamp.fromDate(date(data, "endDate", now)) : null,
        location: string(data, "location"),
        town: string(data, "town"),
        category: string(data, "category") || "Community",
        status: "scheduled",
        availability: "unknown",
        sourceId: string(data, "sourceId"),
        sourceEventId: string(data, "sourceEventId") || input.candidateId,
        ...(string(data, "sourceUrl") ? { sourceUrl: string(data, "sourceUrl") } : {}),
        ...(string(data, "imageUrl") ? { imageUrl: string(data, "imageUrl") } : {}),
        publicationStatus: "published",
        freshnessStatus: "current",
        provenance: "candidate-review",
        lastSeenAt: Timestamp.fromDate(now),
        lastVerifiedAt: Timestamp.fromDate(now),
        missingSince: null,
        missingRunCount: 0,
        ...(typeof data.identityFingerprint === "string" ? { identityFingerprint: data.identityFingerprint } : {}),
        ...(data.identityEvidence ? { identityEvidence: data.identityEvidence } : {}),
        candidateId: input.candidateId,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    transaction.set(candidateRef, { ...reviewerFields, ...(eventId ? { eventId } : {}) }, { merge: true });
    return { status: input.to, ...(eventId ? { eventId } : {}) };
  });
}
