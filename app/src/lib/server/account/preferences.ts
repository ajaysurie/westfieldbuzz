import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { subscriberIdForEmail } from "@/lib/server/email/tokens";
import type { HouseholdPreferences } from "@/lib/personalization";
import { EVENT_CATEGORIES } from "@/lib/events/types";

export interface VerifiedAccount {
  uid: string;
  email: string;
}

function strings(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length > 80)) return null;
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))].slice(0, max);
}

export function validatePreferences(value: unknown): HouseholdPreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const towns = strings(input.towns, 12);
  const interests = strings(input.interests, 12);
  const childAges = Array.isArray(input.childAges)
    ? [...new Set(input.childAges)].filter((age): age is number => Number.isInteger(age) && age >= 0 && age <= 18).slice(0, 12)
    : null;
  if (!towns || !interests || !childAges || interests.some((interest) => !EVENT_CATEGORIES.includes(interest as (typeof EVENT_CATEGORIES)[number]))) return null;
  if (![10, 20, 30, null].includes(input.driveMinutes as 10 | 20 | 30 | null)) return null;
  if (!["indoor", "outdoor", "either"].includes(input.indoorPreference as string)) return null;
  if (input.budgetMax !== null && (!Number.isFinite(input.budgetMax) || (input.budgetMax as number) < 0 || (input.budgetMax as number) > 10_000)) return null;
  if (typeof input.personalizeFriday !== "boolean") return null;
  return {
    towns,
    driveMinutes: input.driveMinutes as HouseholdPreferences["driveMinutes"],
    childAges,
    interests: interests as HouseholdPreferences["interests"],
    indoorPreference: input.indoorPreference as HouseholdPreferences["indoorPreference"],
    budgetMax: input.budgetMax as number | null,
    personalizeFriday: input.personalizeFriday,
  };
}

export async function saveAndLinkPreferences(input: {
  db: Firestore;
  account: VerifiedAccount;
  preferences?: HouseholdPreferences;
}): Promise<{ linked: boolean }> {
  const userRef = input.db.collection("users").doc(input.account.uid);
  const subscriberRef = input.db.collection("subscribers").doc(subscriberIdForEmail(input.account.email));
  return input.db.runTransaction(async (transaction) => {
    const [userSnapshot, subscriberSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(subscriberRef),
    ]);
    const stored = userSnapshot.data()?.preferences;
    const preferences = input.preferences ?? validatePreferences(stored);
    if (input.preferences) {
      transaction.set(userRef, {
        preferences: input.preferences,
        preferenceSchemaVersion: 1,
        preferencesUpdatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    if (!subscriberSnapshot.exists) return { linked: false };
    const existingUserId = subscriberSnapshot.data()?.userId;
    if (existingUserId !== null && existingUserId !== undefined && existingUserId !== input.account.uid) {
      return { linked: false };
    }
    transaction.update(subscriberRef, {
      userId: input.account.uid,
      ...(preferences ? { personalize: preferences.personalizeFriday } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { linked: true };
  });
}
