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
  arrayUnion,
  writeBatch,
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

export interface Service {
  id: string;
  name: string;
  category: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  instagram?: string;
  facebook?: string;
  yelp?: string;
  googleMapsUrl?: string;
  recommendations: number;
  recentRecommenders: (string | { uid: string; displayName?: string; timestamp: Timestamp })[];
  lastRecommended: Timestamp | null;
  seeded?: boolean;
  createdAt: Timestamp;
}

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

export interface SuggestedService {
  id: string;
  userId: string;
  businessName: string;
  category: string;
  address: string;
  phone: string;
  website: string;
  notes: string;
  status: "pending" | "approved" | "rejected";
  suggestedAt: Timestamp;
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

// ===== Stats =====

export async function getCommunityStats(): Promise<{
  providers: number;
  recommendations: number;
  recommenders: number;
}> {
  const snap = await getDocs(collection(db, "services"));
  let totalRecs = 0;
  const recommenderNames = new Set<string>();

  for (const d of snap.docs) {
    const data = d.data();
    totalRecs += data.recommendations || 0;
    const recs = data.recentRecommenders || data.recommendedBy || [];
    for (const r of recs) {
      if (typeof r === "string") recommenderNames.add(r);
    }
  }

  return {
    providers: snap.size,
    recommendations: totalRecs,
    recommenders: recommenderNames.size,
  };
}

// ===== Services =====

export async function getServices(category?: string): Promise<Service[]> {
  const servicesRef = collection(db, "services");
  let q;

  if (category) {
    q = query(servicesRef, where("category", "==", category));
  } else {
    q = query(servicesRef);
  }

  const snap = await getDocs(q);
  const services = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Service));
  // Sort client-side to avoid requiring a composite index
  return services.sort((a, b) => (b.recommendations || 0) - (a.recommendations || 0));
}

export async function getServiceById(id: string): Promise<Service | null> {
  const snap = await getDoc(doc(db, "services", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Service;
}

export async function getCategories(): Promise<string[]> {
  const snap = await getDoc(doc(db, "config", "categories"));
  if (!snap.exists()) return [];
  return snap.data().list || [];
}

export async function getAllServices(): Promise<Service[]> {
  const snap = await getDocs(collection(db, "services"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Service));
}

export async function deleteService(id: string) {
  // Delete recommendations subcollection first
  const recsSnap = await getDocs(collection(db, "services", id, "recommendations"));
  for (const recDoc of recsSnap.docs) {
    await deleteDoc(recDoc.ref);
  }
  // Delete the service doc
  await deleteDoc(doc(db, "services", id));
}

// ===== Recommendations =====

export async function hasUserRecommended(serviceId: string, userId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "services", serviceId, "recommendations", userId));
  return snap.exists();
}

export async function recommendService(serviceId: string, userId: string, displayName?: string) {
  const recRef = doc(db, "services", serviceId, "recommendations", userId);
  const serviceRef = doc(db, "services", serviceId);

  await setDoc(recRef, { uid: userId, timestamp: serverTimestamp() });

  await updateDoc(serviceRef, {
    recommendations: increment(1),
    lastRecommended: serverTimestamp(),
    recentRecommenders: arrayUnion({ uid: userId, displayName: displayName || null, timestamp: new Date() }),
  });
}

export async function unrecommendService(serviceId: string, userId: string) {
  const recRef = doc(db, "services", serviceId, "recommendations", userId);
  const serviceRef = doc(db, "services", serviceId);

  // Get the existing entry to remove from array
  const recSnap = await getDoc(recRef);
  await deleteDoc(recRef);

  if (recSnap.exists()) {
    // We can't easily remove from recentRecommenders by uid only, so we rebuild.
    // For MVP, just decrement the count. Array cleanup happens on next recommend.
    await updateDoc(serviceRef, {
      recommendations: increment(-1),
    });
  }
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

// ===== Suggestions =====

export async function submitSuggestion(data: {
  userId: string;
  businessName: string;
  category: string;
  address: string;
  phone: string;
  website: string;
  notes: string;
}) {
  const ref = doc(collection(db, "suggested_services"));
  await setDoc(ref, {
    ...data,
    status: "pending",
    suggestedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getSuggestions(status?: string): Promise<SuggestedService[]> {
  const ref = collection(db, "suggested_services");
  try {
    const q = status
      ? query(ref, where("status", "==", status), orderBy("suggestedAt", "desc"))
      : query(ref, orderBy("suggestedAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SuggestedService));
  } catch {
    // Fallback: query without orderBy (missing composite index)
    const q = status ? query(ref, where("status", "==", status)) : query(ref);
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as SuggestedService))
      .sort((a, b) => (b.suggestedAt?.seconds || 0) - (a.suggestedAt?.seconds || 0));
  }
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

export async function approveSuggestion(suggestion: SuggestedService) {
  const batch = writeBatch(db);
  const serviceRef = doc(collection(db, "services"));

  // Create actual service
  batch.set(serviceRef, {
    name: suggestion.businessName,
    category: suggestion.category,
    phone: suggestion.phone,
    email: "",
    address: suggestion.address || "",
    website: suggestion.website,
    recommendations: 1,
    // Firestore doesn't allow serverTimestamp() inside array values, so use new Date()
    recentRecommenders: [{ uid: suggestion.userId, displayName: null, timestamp: new Date() }],
    lastRecommended: serverTimestamp(),
    createdAt: serverTimestamp(),
  });

  // Record the submitter's recommendation in the subcollection
  batch.set(
    doc(db, "services", serviceRef.id, "recommendations", suggestion.userId),
    { uid: suggestion.userId, timestamp: serverTimestamp() }
  );

  // Mark suggestion as approved
  batch.update(doc(db, "suggested_services", suggestion.id), {
    status: "approved",
  });

  await batch.commit();
}

export async function rejectSuggestion(suggestionId: string) {
  await updateDoc(doc(db, "suggested_services", suggestionId), {
    status: "rejected",
  });
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
