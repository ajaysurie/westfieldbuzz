import type { SearchIntent } from "./search/event-intent";
import type { HouseholdPreferences } from "./personalization";

/**
 * Fill a parsed search intent's empty constraint fields from saved household
 * preferences. Standing facts only: ages, towns, drive time, and budget are
 * things a household means every time. Interests and indoor/outdoor stay out
 * deliberately; they are ranking signals, and defaulting them would silently
 * narrow "what's happening this weekend" to a subset. Anything the sentence
 * stated always wins over a preference.
 */
export function applyPreferenceDefaults(
  intent: SearchIntent,
  preferences: HouseholdPreferences | null
): { intent: SearchIntent; appliedFields: string[] } {
  if (!preferences) return { intent, appliedFields: [] };
  const appliedFields: string[] = [];
  const next = { ...intent };
  if (next.partyAges.length === 0 && preferences.childAges.length > 0) {
    next.partyAges = [...preferences.childAges];
    appliedFields.push("ages");
  }
  if (next.towns.length === 0 && preferences.towns.length > 0) {
    next.towns = [...preferences.towns];
    appliedFields.push("towns");
  }
  if (next.maxDriveMinutes === null && preferences.driveMinutes !== null) {
    next.maxDriveMinutes = preferences.driveMinutes;
    appliedFields.push("drive time");
  }
  if (next.budget === null && preferences.budgetMax !== null) {
    next.budget = { freeOnly: false, maxAmount: preferences.budgetMax };
    appliedFields.push("budget");
  }
  return { intent: appliedFields.length ? next : intent, appliedFields };
}
