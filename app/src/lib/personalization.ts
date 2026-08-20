import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { EventCategory } from "./events/types";

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
  userId: string,
  preferences: HouseholdPreferences
): Promise<void> {
  await setDoc(
    doc(db, "users", userId),
    {
      preferences,
      preferenceSchemaVersion: 1,
      preferencesUpdatedAt: serverTimestamp(),
    },
    { merge: true }
  );
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
  intent: Record<string, unknown>
): Promise<void> {
  await setDoc(
    doc(db, "users", userId, "savedSearches", searchId),
    {
      label: label.trim(),
      intent,
      schemaVersion: 1,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}

