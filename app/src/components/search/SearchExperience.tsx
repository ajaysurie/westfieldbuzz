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
import { useAuth } from "@/lib/auth";
import {
  clearAuthContinuation,
  continuationLoginHref,
  createAuthContinuation,
  readAuthContinuation,
  stripAuthContinuationParams,
} from "@/lib/auth-continuation";
import { isSearchSaved, saveSearch, savedSearchLabel, stableSearchId, unsaveSearch } from "@/lib/personalization";
import { consumeSearchHandoff } from "./HomeSearch";

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
  const { user, loading: authLoading } = useAuth();
  const userId = user?.uid;
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<EventSearchSuccess | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextRequestId = useRef(0);
  const activeRequest = useRef<{ id: number; controller: AbortController } | null>(null);
  const savedRequest = useRef(0);
  const processingContinuation = useRef<string | null>(null);
  const [continuationRetry, setContinuationRetry] = useState(0);
  const [searchSaved, setSearchSaved] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const search = useCallback(async (
    sentence: string,
    priorIntent: SearchIntent | null = null,
    structuredIntent: SearchIntent | null = null
  ): Promise<EventSearchSuccess | null> => {
    const requestId = ++nextRequestId.current;
    activeRequest.current?.controller.abort();
    const controller = new AbortController();
    activeRequest.current = { id: requestId, controller };
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/event-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          structuredIntent
            ? { mode: "structured", intent: structuredIntent }
            : { query: sentence, ...(priorIntent ? { intent: priorIntent } : {}) }
        ),
        signal: controller.signal,
      });
      const payload = (await response.json()) as EventSearchResponse;
      if (activeRequest.current?.id !== requestId) return null;
      if (!payload.ok) {
        setError(payload.error.message);
        return null;
      }
      setResult(payload);
      return payload;
    } catch {
      if (activeRequest.current?.id !== requestId) return null;
      setError("Search could not connect. Please try again or browse the calendar.");
      return null;
    } finally {
      if (activeRequest.current?.id === requestId) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }, []);

  const initialSearchStarted = useRef(false);
  useEffect(() => {
    if (initialSearchStarted.current) return;
    initialSearchStarted.current = true;
    const handoff = typeof window === "undefined" ? "" : consumeSearchHandoff();
    const firstQuery = handoff || initialQuery;
    if (firstQuery.trim()) {
      setQuery(firstQuery);
      void search(firstQuery);
    }
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
    void search("", null, nextIntent);
  };

  const currentSearch = result
    ? { id: stableSearchId(result.intent), label: savedSearchLabel(result.intent), intent: result.intent }
    : null;
  const currentSearchId = currentSearch?.id;

  useEffect(() => {
    const request = ++savedRequest.current;
    if (!userId || !currentSearchId || processingContinuation.current) {
      setSearchSaved(false);
      return;
    }
    void isSearchSaved(userId, currentSearchId)
      .then((value) => {
        if (savedRequest.current === request) setSearchSaved(value);
      })
      .catch(() => {
        if (savedRequest.current === request) setSaveError("We could not check this saved search.");
      });
  }, [currentSearchId, userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("continuation");
    const mode = params.get("mode");
    if (!id || (mode !== "resume" && mode !== "cancel") || processingContinuation.current === id) return;
    const continuation = readAuthContinuation(id);
    if (continuation?.action.kind !== "save-search") {
      // The local payload may be missing/expired after switching devices. Keep
      // unrelated filters/hash but remove unusable auth transport state.
      window.history.replaceState({}, "", stripAuthContinuationParams(`${window.location.pathname}${window.location.search}${window.location.hash}`));
      setSaveError("That save request expired. Search again, then choose Save this search.");
      return;
    }
    if (mode === "resume" && !userId) return;
    const action = continuation.action;
    let cancelled = false;
    processingContinuation.current = id;
    setQuery(action.label);
    setSavePending(mode === "resume");
    setSaveError(null);
    setSaveNotice(null);
    void (async () => {
      const restored = await search(action.label, null, action.intent);
      if (cancelled) return;
      if (!restored || processingContinuation.current !== id) {
        processingContinuation.current = null;
        setSavePending(false);
        setSaveError("We could not restore this search. Try again.");
        return;
      }
      if (mode === "cancel") {
        clearAuthContinuation(id);
        window.history.replaceState(
          {},
          "",
          stripAuthContinuationParams(`${window.location.pathname}${window.location.search}${window.location.hash}`)
        );
        processingContinuation.current = null;
        setSaveNotice("Search restored without saving.");
        return;
      }
      try {
        await saveSearch(userId!, action.searchId, action.label, action.intent);
        if (cancelled || processingContinuation.current !== id) return;
        setSearchSaved(true);
        clearAuthContinuation(id);
        window.history.replaceState(
          {},
          "",
          stripAuthContinuationParams(`${window.location.pathname}${window.location.search}${window.location.hash}`)
        );
        setSaveNotice("Search saved.");
      } catch {
        if (!cancelled) setSaveError("We could not save this search. Try again.");
      } finally {
        if (!cancelled) {
          if (processingContinuation.current === id) processingContinuation.current = null;
          setSavePending(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (processingContinuation.current === id) processingContinuation.current = null;
    };
  }, [continuationRetry, search, userId]);

  async function toggleSaveSearch() {
    if (!currentSearch) return;
    if (!user) {
      // The continuation holds the normalized intent; the return URL never
      // needs the raw `q` search text.
      const returnTo = window.location.pathname;
      const id = createAuthContinuation(
        { kind: "save-search", searchId: currentSearch.id, label: currentSearch.label, intent: currentSearch.intent },
        returnTo
      );
      if (id) window.location.assign(continuationLoginHref(id, returnTo));
      else setSaveError("We could not prepare sign-in. Please try again.");
      return;
    }
    const request = ++savedRequest.current;
    const nextSaved = !searchSaved;
    setSavePending(true);
    setSaveError(null);
    setSaveNotice(null);
    try {
      if (nextSaved) await saveSearch(user.uid, currentSearch.id, currentSearch.label, currentSearch.intent);
      else await unsaveSearch(user.uid, currentSearch.id);
      if (savedRequest.current !== request) return;
      setSearchSaved(nextSaved);
      if (nextSaved) {
        const id = new URLSearchParams(window.location.search).get("continuation");
        const continuation = readAuthContinuation(id);
        if (id && continuation?.action.kind === "save-search" && continuation.action.searchId === currentSearch.id) {
          clearAuthContinuation(id);
          window.history.replaceState(
            {},
            "",
            stripAuthContinuationParams(`${window.location.pathname}${window.location.search}${window.location.hash}`)
          );
        }
      }
    } catch {
      if (savedRequest.current === request) setSaveError(`We could not ${nextSaved ? "save" : "remove"} this search. Try again.`);
    } finally {
      if (savedRequest.current === request) setSavePending(false);
    }
  }

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
        {(saveError || saveNotice) && (
          <p role={saveError ? "alert" : "status"} className="mb-4 rounded-xl border border-black/8 bg-white p-4 text-sm text-ink-light">
            {saveError || saveNotice}
            {saveError && new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("continuation") && (
              <button type="button" onClick={() => setContinuationRetry((value) => value + 1)} className="ml-2 font-bold text-accent underline">
                Try again
              </button>
            )}
          </p>
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
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => void toggleSaveSearch()} disabled={authLoading || savePending} aria-pressed={searchSaved} className="min-h-10 rounded-lg border border-accent/25 bg-white px-3 text-xs font-bold text-accent disabled:opacity-50">
                {savePending ? "Saving…" : searchSaved ? "Saved search" : "Save this search"}
              </button>
              <span className="text-xs text-ink-muted">Saves the filters, not your search wording.</span>
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
