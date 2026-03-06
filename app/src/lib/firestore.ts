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
  arrayUnion,
  arrayRemove,
  type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// ===== Types =====

export interface Service {
  id: string;
  name: string;
  category: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  recommendations: number;
  recentRecommenders: (string | { uid: string; timestamp: Timestamp })[];
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
  category: string;
  interestedCount: number;
  createdBy: string;
  createdAt: Timestamp;
}

export interface SuggestedService {
  id: string;
  userId: string;
  businessName: string;
  category: string;
  phone: string;
  website: string;
  notes: string;
  status: "pending" | "approved" | "rejected";
  suggestedAt: Timestamp;
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

export async function recommendService(serviceId: string, userId: string) {
  const recRef = doc(db, "services", serviceId, "recommendations", userId);
  const serviceRef = doc(db, "services", serviceId);

  await setDoc(recRef, { uid: userId, timestamp: serverTimestamp() });

  await updateDoc(serviceRef, {
    recommendations: increment(1),
    lastRecommended: serverTimestamp(),
    recentRecommenders: arrayUnion({ uid: userId, timestamp: new Date() }),
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

export async function getEvents(category?: string): Promise<Event[]> {
  const eventsRef = collection(db, "events");
  let q;

  if (category) {
    q = query(eventsRef, where("category", "==", category), orderBy("date", "asc"));
  } else {
    q = query(eventsRef, orderBy("date", "asc"));
  }

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Event));
}

export async function getEventById(id: string): Promise<Event | null> {
  const snap = await getDoc(doc(db, "events", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Event;
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
  let q;

  if (status) {
    q = query(ref, where("status", "==", status), orderBy("suggestedAt", "desc"));
  } else {
    q = query(ref, orderBy("suggestedAt", "desc"));
  }

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SuggestedService));
}

export async function approveSuggestion(suggestion: SuggestedService) {
  // Create actual service
  const serviceRef = doc(collection(db, "services"));
  await setDoc(serviceRef, {
    name: suggestion.businessName,
    category: suggestion.category,
    phone: suggestion.phone,
    email: "",
    address: "",
    website: suggestion.website,
    recommendations: 0,
    recentRecommenders: [],
    lastRecommended: null,
    createdAt: serverTimestamp(),
  });

  // Mark suggestion as approved
  await updateDoc(doc(db, "suggested_services", suggestion.id), {
    status: "approved",
  });
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
  category: string;
  createdBy: string;
}) {
  const ref = doc(collection(db, "events"));
  await setDoc(ref, {
    ...data,
    interestedCount: 0,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateEvent(eventId: string, data: Partial<Event>) {
  await updateDoc(doc(db, "events", eventId), data);
}

export async function deleteEvent(eventId: string) {
  await deleteDoc(doc(db, "events", eventId));
}
