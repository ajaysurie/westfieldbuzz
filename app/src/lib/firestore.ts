import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  increment,
  serverTimestamp,
  query,
  orderBy,
  where,
  documentId,
  limit as firestoreLimit,
  type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  EventCategory,
  EventAvailability,
  EventFreshness,
  EventPublicationStatus,
  EventProvenance,
  EventStatus,
  ManualVerification,
} from "./events/types";
import { normalizeCategory } from "./events/normalize";
import { isWithinVerificationAge } from "./events/freshness";

// ===== Types =====

export interface Event {
  id: string;
  title: string;
  description: string;
  date: Timestamp;
  endDate: Timestamp | null;
  location: string;
  category: EventCategory;
  interestedCount: number;
  createdBy: string;
  createdAt: Timestamp;
  sourceId?: string;
  sourceEventId?: string;
  sourceEventAliases?: string[];
  sourceUrl?: string;
  imageUrl?: string;
  town?: string;
  status?: EventStatus;
  availability?: EventAvailability;
  publicationStatus?: EventPublicationStatus;
  freshnessStatus?: EventFreshness;
  lastSeenAt?: Timestamp;
  lastVerifiedAt?: Timestamp;
  missingSince?: Timestamp | null;
  missingRunCount?: number;
  provenance?: EventProvenance;
  manualVerification?: ManualVerification<Timestamp>;
  suppressedAt?: Timestamp;
  suppressedBy?: string;
  suppressionReason?: string;
}

/** Operational data written by the server-side ingestion runner. */
export interface SourceHealth {
  id: string;
  sourceId: string;
  sourceName: string;
  group: string;
  status: string;
  checkedAt?: Timestamp;
  nextExpectedRunAt?: Timestamp;
  consecutiveFailures?: number;
  fetched?: number;
  created?: number;
  updated?: number;
  candidates?: number;
  safetyHeld?: boolean;
  errors?: string[];
  warnings?: string[];
}

/** A source observation held for an operator instead of automatic publication. */
export interface PendingEventCandidate {
  id: string;
  sourceId: string;
  sourceName?: string;
  title: string;
  date?: Timestamp;
  sourceUrl?: string;
  reason: string;
  matchingEventIds?: string[];
  matchingSourceIds?: string[];
  /** How a possible-cross-source-duplicate hold was detected. */
  matchKind?: "exact" | "fuzzy";
  /** Fuzzy match score (0-1) when matchKind is "fuzzy". */
  matchScore?: number;
  reviewStatus: "pending" | "approved" | "rejected" | "suppressed" | "superseded" | "reopened" | "resolved";
}

export interface SourceCandidate {
  id: string;
  name?: string;
  url?: string;
  host?: string;
  reviewStatus: PendingEventCandidate["reviewStatus"];
  reason?: string;
}

// ===== Events =====

function eventFromSnapshot(id: string, data: Record<string, unknown>): Event {
  return {
    ...data,
    id,
    category: normalizeCategory(typeof data.category === "string" ? data.category : undefined),
    status: data.status === "cancelled" || data.status === "postponed"
      || data.status === "rescheduled" || data.status === "weather-dependent"
      ? data.status
      : "scheduled",
    availability: data.availability === "available" || data.availability === "registration-required"
      || data.availability === "waitlist" || data.availability === "sold-out"
      ? data.availability
      : "unknown",
  } as Event;
}

export const MAX_PUBLIC_EVENT_LIMIT = 200;

export async function getEvents(category?: string): Promise<Event[]> {
  const eventsRef = collection(db, "events");
  let q;

  if (category) {
    q = query(eventsRef, where("category", "==", category), orderBy("date", "asc"));
  } else {
    q = query(eventsRef, orderBy("date", "asc"));
  }

  const snap = await getDocs(q);
  return snap.docs.map((d) => eventFromSnapshot(d.id, d.data()));
}

export async function getEventById(id: string): Promise<Event | null> {
  const snap = await getDoc(doc(db, "events", id));
  if (!snap.exists()) return null;
  return eventFromSnapshot(snap.id, snap.data());
}

export async function getPublicEvents(input: {
  from: Date;
  to: Date;
  category?: string;
  limit?: number;
}): Promise<Event[]> {
  const eventsRef = collection(db, "events");
  const cappedLimit = Math.min(
    MAX_PUBLIC_EVENT_LIMIT,
    Math.max(1, Math.floor(input.limit ?? MAX_PUBLIC_EVENT_LIMIT))
  );
  const constraints = [
    where("publicationStatus", "==", "published"),
    where("date", ">=", input.from),
    where("date", "<=", input.to),
  ];
  if (input.category) {
    constraints.push(where("category", "==", normalizeCategory(input.category)));
  }
  const snap = await getDocs(query(
    eventsRef,
    ...constraints,
    orderBy("date", "asc"),
    firestoreLimit(cappedLimit)
  ));
  return snap.docs
    .map((document) => eventFromSnapshot(document.id, document.data()))
    .filter((event) => event.freshnessStatus === "current" && isWithinVerificationAge(event.lastVerifiedAt?.toDate?.()));
}

export async function getPublishedEventById(id: string): Promise<Event | null> {
  const snap = await getDocs(query(
    collection(db, "events"),
    where(documentId(), "==", id),
    where("publicationStatus", "==", "published"),
    firestoreLimit(1)
  ));
  const document = snap.docs[0];
  if (!document) return null;
  const event = eventFromSnapshot(document.id, document.data());
  return event.freshnessStatus === "current" && isWithinVerificationAge(event.lastVerifiedAt?.toDate?.())
    ? event : null;
}

export async function hasUserInterested(eventId: string, userId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "events", eventId, "interested", userId));
  return snap.exists();
}

export async function markInterested(eventId: string, userId: string) {
  await setDoc(doc(db, "events", eventId, "interested", userId), {
    uid: userId,
    timestamp: serverTimestamp(),
  });
  await updateDoc(doc(db, "events", eventId), {
    interestedCount: increment(1),
  });
}

export async function unmarkInterested(eventId: string, userId: string) {
  await deleteDoc(doc(db, "events", eventId, "interested", userId));
  await updateDoc(doc(db, "events", eventId), {
    interestedCount: increment(-1),
  });
}

// ===== Admin operational visibility =====

export async function getSourceHealth(): Promise<SourceHealth[]> {
  const snap = await getDocs(collection(db, "eventSourceHealth"));
  return snap.docs
    .map((document) => ({ id: document.id, ...document.data() } as SourceHealth))
    .sort((left, right) => (left.sourceName || left.sourceId).localeCompare(right.sourceName || right.sourceId));
}

export async function getPendingEventCandidates(): Promise<PendingEventCandidate[]> {
  const snap = await getDocs(query(
    collection(db, "eventCandidates"),
    where("reviewStatus", "==", "pending")
  ));
  return snap.docs
    .map((document) => ({ id: document.id, ...document.data() } as PendingEventCandidate))
    .sort((left, right) => {
      const leftDate = left.date?.seconds ?? 0;
      const rightDate = right.date?.seconds ?? 0;
      return leftDate - rightDate || left.title.localeCompare(right.title);
    });
}

export async function getSourceCandidates(): Promise<SourceCandidate[]> {
  const snap = await getDocs(collection(db, "sourceCandidates"));
  return snap.docs.map((document) => ({ id: document.id, ...document.data() } as SourceCandidate))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export async function sendTestDigest(token: string): Promise<{
  ok: boolean;
  editionId?: string;
  issueLabel?: string;
  events?: number;
  holdReason?: string;
  error?: string;
}> {
  const response = await fetch("/api/admin/digest-test", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? body.message ?? "Test digest could not be sent.");
  return body;
}

export async function reviewCandidate(token: string, input: {
  kind: "event" | "source";
  id: string;
  action: "approve" | "reject" | "suppress" | "resolve";
}): Promise<void> {
  const response = await fetch("/api/admin/review", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("Review action could not be saved.");
}

// ===== Admin Events CRUD =====

export async function createEvent(data: {
  title: string;
  description: string;
  date: Date;
  endDate: Date | null;
  location: string;
  town?: string;
  category: EventCategory;
  createdBy: string;
  verificationEvidenceUrl?: string;
}) {
  const ref = doc(collection(db, "events"));
  await setDoc(ref, {
    ...data,
    interestedCount: 0,
    // Manual events are intentionally distinct from crawler observations, but
    // remain complete published event projections under the public-read rule.
    publicationStatus: "published",
    freshnessStatus: "current",
    status: "scheduled",
    availability: "unknown",
    sourceId: "manual-admin",
    sourceEventId: ref.id,
    town: data.town?.trim() || "Westfield",
    provenance: "manual",
    manualVerification: {
      verifier: data.createdBy,
      verifiedAt: serverTimestamp(),
      ...(data.verificationEvidenceUrl?.trim()
        ? { evidenceUrl: data.verificationEvidenceUrl.trim() }
        : {}),
    },
    lastSeenAt: serverTimestamp(),
    lastVerifiedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateEvent(eventId: string, data: Partial<Event>) {
  await updateDoc(doc(db, "events", eventId), data);
}

/**
 * Operator deletion is a reversible suppression. It deliberately keeps the
 * event document, fingerprint, source evidence, revisions, and user saves.
 * Ingestion respects this state and therefore cannot republish it by race.
 */
export async function suppressEvent(eventId: string, input: { by: string; reason?: string }) {
  await updateDoc(doc(db, "events", eventId), {
    publicationStatus: "suppressed",
    suppressedAt: serverTimestamp(),
    suppressedBy: input.by,
    suppressionReason: input.reason?.trim() || "operator-suppressed",
  });
}

export async function restoreEvent(eventId: string) {
  await updateDoc(doc(db, "events", eventId), {
    publicationStatus: "published",
    suppressedAt: null,
    suppressedBy: null,
    suppressionReason: null,
    reviewHeldAt: null,
  });
}
