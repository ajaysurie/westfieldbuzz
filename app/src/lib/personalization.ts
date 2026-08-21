import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { EventCategory } from "./events/types";
import { validateSearchIntent, type SearchIntent } from "./search/event-intent";

export interface HouseholdPreferences {
  towns: string[];
  driveMinutes: 10 | 20 | 30 | null;
  childAges: number[];
  interests: EventCategory[];
  indoorPreference: "indoor" | "outdoor" | "either";
  budgetMax: number | null;
  personalizeFriday: boolean;
}

export const EMPTY_PREFERENCES: HouseholdPreferences = {
  towns: ["Westfield"],
  driveMinutes: 20,
  childAges: [],
  interests: [],
  indoorPreference: "either",
  budgetMax: null,
  personalizeFriday: false,
};

export async function getPreferences(userId: string): Promise<HouseholdPreferences> {
  const snapshot = await getDoc(doc(db, "users", userId));
  const stored = snapshot.data()?.preferences as Partial<HouseholdPreferences> | undefined;
  return { ...EMPTY_PREFERENCES, ...stored };
}

export async function savePreferences(
  token: string,
  preferences: HouseholdPreferences
): Promise<{ linked: boolean }> {
  const response = await fetch("/api/account/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ preferences }),
  });
  const payload = (await response.json().catch(() => ({}))) as { linked?: boolean; message?: string };
  if (!response.ok) throw new Error(payload.message ?? "We could not save your preferences.");
  return { linked: payload.linked === true };
}

export async function saveEvent(userId: string, eventId: string): Promise<void> {
  await setDoc(doc(db, "users", userId, "savedEvents", eventId), {
    eventId,
    savedAt: serverTimestamp(),
  });
}

export async function unsaveEvent(userId: string, eventId: string): Promise<void> {
  await deleteDoc(doc(db, "users", userId, "savedEvents", eventId));
}

export async function isEventSaved(userId: string, eventId: string): Promise<boolean> {
  return (await getDoc(doc(db, "users", userId, "savedEvents", eventId))).exists();
}

export async function getSavedEventIds(userId: string): Promise<string[]> {
  const snapshot = await getDocs(collection(db, "users", userId, "savedEvents"));
  return snapshot.docs.map((item) => item.id);
}

export async function saveSearch(
  userId: string,
  searchId: string,
  label: string,
  intent: SearchIntent
): Promise<void> {
  const reference = doc(db, "users", userId, "savedSearches", searchId);
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(reference);
    transaction.set(
      reference,
      {
        label: label.trim().slice(0, 160),
        intent,
        schemaVersion: 1,
        updatedAt: serverTimestamp(),
        ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
      },
      { merge: true }
    );
  });
}

export function stableSearchId(intent: SearchIntent): string {
  const normalized = validateSearchIntent(intent);
  if (!normalized) throw new Error("Search intent is invalid");
  // FNV-1a is used for a stable document key, not security. The intent itself
  // is retained in the document and collisions remain harmless/idempotent.
  const value = JSON.stringify(normalized);
  let high = 0x811c9dc5;
  let low = 0x01000193;
  for (let index = 0; index < value.length; index += 1) {
    high = Math.imul(high ^ value.charCodeAt(index), 0x01000193) >>> 0;
    low = Math.imul(low ^ (value.charCodeAt(index) + index), 0x01000193) >>> 0;
  }
  return `search_${high.toString(36)}${low.toString(36)}`;
}

export function savedSearchLabel(intent: SearchIntent): string {
  const parts = [
    ...intent.categories.slice(0, 2),
    ...intent.towns.slice(0, 2),
    intent.environment ? `${intent.environment} events` : "",
    intent.budget?.freeOnly ? "Free" : "",
    intent.maxDriveMinutes ? `within ${intent.maxDriveMinutes} min` : "",
    intent.timeOfDay[0] ?? "",
  ].filter(Boolean);
  return (parts.join(" · ") || "Saved event search").slice(0, 160);
}

export async function isSearchSaved(userId: string, searchId: string): Promise<boolean> {
  return (await getDoc(doc(db, "users", userId, "savedSearches", searchId))).exists();
}

export async function unsaveSearch(userId: string, searchId: string): Promise<void> {
  await deleteDoc(doc(db, "users", userId, "savedSearches", searchId));
}

export async function getSavedSearches(userId: string): Promise<Array<{ id: string; label: string; intent: SearchIntent }>> {
  const snapshot = await getDocs(collection(db, "users", userId, "savedSearches"));
  return snapshot.docs.flatMap((item) => {
    const data = item.data();
    const intent = validateSearchIntent(data.intent);
    return intent && typeof data.label === "string" ? [{ id: item.id, label: data.label, intent }] : [];
  });
}
