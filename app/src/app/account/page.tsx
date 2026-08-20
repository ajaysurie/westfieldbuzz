"use client";

import { useAuth } from "@/lib/auth";
import AuthGate from "@/components/AuthGate";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  EMPTY_PREFERENCES,
  getPreferences,
  savePreferences,
  type HouseholdPreferences,
} from "@/lib/personalization";
import type { EventCategory } from "@/lib/events/types";

const INTEREST_OPTIONS: EventCategory[] = [
  "Family & Kids",
  "Arts & Culture",
  "Sports & Recreation",
  "Music",
  "Food & Drink",
];

export default function AccountPage() {
  return (
    <AuthGate>
      <AccountContent />
    </AuthGate>
  );
}

function AccountContent() {
  const { user, photoURL, logout } = useAuth();
  const router = useRouter();
  const [preferences, setPreferences] = useState<HouseholdPreferences>(EMPTY_PREFERENCES);
  const [townsInput, setTownsInput] = useState("Westfield");
  const [agesInput, setAgesInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!user) return;
    getPreferences(user.uid)
      .then((value) => {
        setPreferences(value);
        setTownsInput(value.towns.join(", "));
        setAgesInput(value.childAges.join(", "));
      })
      .catch(() => setStatus("We could not load your preferences."));
  }, [user]);

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  const toggleInterest = (interest: EventCategory) => {
    setPreferences((current) => ({
      ...current,
      interests: current.interests.includes(interest)
        ? current.interests.filter((item) => item !== interest)
        : [...current.interests, interest],
    }));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setStatus("");
    const next: HouseholdPreferences = {
      ...preferences,
      towns: townsInput.split(",").map((town) => town.trim()).filter(Boolean),
      childAges: agesInput
        .split(",")
        .map((age) => Number(age.trim()))
        .filter((age) => Number.isInteger(age) && age >= 0 && age <= 18),
    };
    try {
      await savePreferences(user.uid, next);
      setPreferences(next);
      setStatus("Preferences saved.");
    } catch {
      setStatus("We could not save your preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[600px] px-12 py-16 max-md:px-6">
      <h1
        className="mb-8"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "2rem",
          fontWeight: 400,
          color: "var(--ink)",
        }}
      >
        Your Account
      </h1>

      <div className="mb-8 flex items-center gap-4 rounded-[10px] border border-black/6 bg-paper-pure p-6">
        {photoURL && (
          <img
            src={photoURL}
            alt=""
            className="h-14 w-14 rounded-full"
            referrerPolicy="no-referrer"
          />
        )}
        <div>
          <div className="text-[1rem] font-semibold text-ink">
            {user?.displayName || "User"}
          </div>
          <div className="text-[0.85rem] text-ink-muted">
            {user?.email || ""}
          </div>
        </div>
      </div>

      {/* Linked accounts */}
      <div className="mb-8">
        <div className="mb-3 text-[0.72rem] font-bold uppercase tracking-[0.15em] text-ink-muted">
          Linked Accounts
        </div>
        <div className="flex flex-col gap-2">
          {user?.providerData?.map((p) => (
            <div key={p.providerId} className="flex items-center gap-2 text-[0.85rem] text-ink-light">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
              {p.providerId === "google.com"
                ? "Google"
                : p.providerId === "facebook.com"
                  ? "Facebook (existing account)"
                  : p.providerId === "password"
                    ? "Email link"
                    : p.providerId}
            </div>
          ))}
        </div>
      </div>

      <section className="mb-8 rounded-[10px] border border-black/6 bg-paper-pure p-6">
        <div className="mb-1 text-[0.72rem] font-bold uppercase tracking-[0.15em] text-accent">
          Household preferences
        </div>
        <p className="mb-6 text-[0.86rem] leading-relaxed text-ink-light">
          Optional. These improve saved searches and your Friday email; they never limit public browsing.
        </p>

        <label htmlFor="towns" className="mb-2 block text-[0.78rem] font-semibold text-ink-light">
          Towns, separated by commas
        </label>
        <input id="towns" value={townsInput} onChange={(event) => setTownsInput(event.target.value)} className="mb-5 min-h-11 w-full rounded-lg border border-black/12 px-4 text-base outline-none focus:border-accent" />

        <label htmlFor="ages" className="mb-2 block text-[0.78rem] font-semibold text-ink-light">
          Children&apos;s ages, separated by commas
        </label>
        <input id="ages" inputMode="numeric" value={agesInput} onChange={(event) => setAgesInput(event.target.value)} className="mb-5 min-h-11 w-full rounded-lg border border-black/12 px-4 text-base outline-none focus:border-accent" placeholder="5, 8" />

        <div className="mb-2 text-[0.78rem] font-semibold text-ink-light">Things you want more often</div>
        <div className="mb-5 flex flex-wrap gap-2">
          {INTEREST_OPTIONS.map((interest) => {
            const selected = preferences.interests.includes(interest);
            return <button key={interest} type="button" aria-pressed={selected} onClick={() => toggleInterest(interest)} className={`min-h-10 rounded-full border px-3.5 text-[0.8rem] font-medium ${selected ? "border-ink bg-ink text-paper-pure" : "border-black/12 bg-paper text-ink-light"}`}>{interest}</button>;
          })}
        </div>

        <label className="mb-5 flex items-start gap-3 text-[0.84rem] leading-relaxed text-ink-light">
          <input type="checkbox" checked={preferences.personalizeFriday} onChange={(event) => setPreferences((current) => ({ ...current, personalizeFriday: event.target.checked }))} className="mt-1 h-4 w-4" />
          Personalize my Friday email. If there are not enough matches, send the generic list.
        </label>

        <button type="button" onClick={handleSave} disabled={saving} className="min-h-11 rounded-lg bg-ink px-5 text-[0.86rem] font-semibold text-paper-pure disabled:opacity-50">{saving ? "Saving..." : "Save preferences"}</button>
        {status && <p role="status" className="mt-3 text-[0.82rem] text-ink-light">{status}</p>}
      </section>

      <button
        onClick={handleLogout}
        className="rounded-lg border border-black/12 bg-paper-pure px-6 py-2.5 text-[0.85rem] font-medium text-ink-light transition-colors hover:border-black/20 hover:text-ink"
      >
        Log Out
      </button>
    </div>
  );
}
