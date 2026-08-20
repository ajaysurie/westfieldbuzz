"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { SearchIntent } from "@/lib/search/event-intent";
import type { EventSearchResponse, EventSearchSuccess } from "@/lib/search/search-contract";
import SearchForm from "./SearchForm";
import IntentChips from "./IntentChips";
import SearchNotice from "./SearchNotice";
import SearchResults from "./SearchResults";
import RefinementForm from "./RefinementForm";

function removeIntentValue(intent: SearchIntent, field: string, label: string): SearchIntent {
  const next = structuredClone(intent);
  if (field === "dateWindow") next.dateWindow = null;
  if (field === "maxDriveMinutes") next.maxDriveMinutes = null;
  if (field === "budget") next.budget = null;
  if (field === "environment") next.environment = null;
  if (field === "registration") next.registration = null;
  if (field === "partyAges") next.partyAges = next.partyAges.filter((age) => `Age ${age}` !== label);
  if (field === "towns") next.towns = next.towns.filter((town) => town !== label);
  if (field === "categories") next.categories = next.categories.filter((category) => category !== label);
  if (field === "timeOfDay") next.timeOfDay = next.timeOfDay.filter((part) => part.toLowerCase() !== label.toLowerCase());
  if (field === "exclusions") next.exclusions.categories = next.exclusions.categories.filter((category) => `Not ${category}` !== label);
  return next;
}
export default function SearchExperience({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<EventSearchSuccess | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (sentence: string, priorIntent: SearchIntent | null = null) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/event-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: sentence, ...(priorIntent ? { intent: priorIntent } : {}) }),
      });
      const payload = (await response.json()) as EventSearchResponse;
      if (!payload.ok) {
        setError(payload.error.message);
        return;
      }
      setResult(payload);
    } catch {
      setError("Search could not connect. Please try again or browse the calendar.");
    } finally {
      setLoading(false);
    }
  }, []);

  const initialSearchStarted = useRef(false);
  useEffect(() => {
    if (initialSearchStarted.current || !initialQuery.trim()) return;
    initialSearchStarted.current = true;
    void search(initialQuery);
  }, [initialQuery, search]);

  const submitInitial = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (query.trim()) void search(query);
  };
  const refine = (sentence: string) => {
    setQuery(sentence);
    void search(sentence, result?.intent ?? null);
  };
  const removeChip = (field: string, label: string) => {
    if (!result) return;
    const nextIntent = removeIntentValue(result.intent, field, label);
    void search("Keep the remaining filters", nextIntent);
  };

  return (
    <>
      <header className="border-b border-black/8 bg-[linear-gradient(180deg,#eef2f3_0%,var(--paper)_100%)] px-6 py-8 max-sm:px-4 max-sm:py-5">
        <div className="mx-auto mb-5 max-w-[920px]">
          <p className="text-[0.65rem] font-bold uppercase tracking-[.16em] text-gold">Search what’s happening</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-4xl leading-tight text-ink max-sm:text-3xl">Describe the outing you have in mind.</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-light">Dates, ages, budget, location, or just a mood. We interpret the request, then match only stored event facts.</p>
        </div>
        <SearchForm value={query} onChange={setQuery} onSubmit={submitInitial} loading={loading} />
        {result && <IntentChips intent={result.intent} onRemove={removeChip} disabled={loading} />}
      </header>

      <section className="mx-auto min-h-[55vh] w-[min(1040px,calc(100%-48px))] py-9 max-sm:w-[calc(100%-32px)] max-sm:py-6" aria-busy={loading}>
        {error && (
          <div role="alert" className="rounded-xl border border-sienna/20 bg-white p-4 text-sm text-ink-light">
            {error} <Link href="/events" className="font-bold text-accent">Browse the calendar</Link>
          </div>
        )}
        {!result && !error && (
          <div className="rounded-2xl border border-black/8 bg-white px-6 py-12 text-center">
            <p className="font-[family-name:var(--font-display)] text-2xl text-ink">Try a sentence, not a filter maze.</p>
            <div className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-2">
              {["Free live music Friday night", "Indoors Saturday morning for a 5-year-old", "Not sports, within 15 minutes"].map((example) => (
                <button key={example} type="button" onClick={() => { setQuery(example); void search(example); }} className="min-h-10 rounded-full border border-accent/15 bg-accent/5 px-3 text-xs font-semibold text-accent hover:bg-accent/10">{example}</button>
              ))}
            </div>
          </div>
        )}
        {result && (
          <div className="grid gap-5">
            <SearchNotice result={result} onRefine={refine} loading={loading} />
            <div className="flex items-end justify-between gap-6">
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-4xl leading-tight text-ink max-sm:text-3xl">{result.meta.matchedCount === 0 ? "No exact matches" : `${result.meta.matchedCount} ${result.meta.matchedCount === 1 ? "good match" : "good matches"}`}</h2>
                <p className="mt-1 text-sm text-ink-light">Results are filtered and ranked from the current event inventory.</p>
              </div>
              <span className="text-xs text-ink-muted max-sm:hidden">{result.meta.candidateCount} events checked</span>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_276px] items-start gap-7 max-md:grid-cols-1">
              <SearchResults result={result} />
              <RefinementForm onSubmit={refine} loading={loading} />
            </div>
          </div>
        )}
      </section>
    </>
  );
}
