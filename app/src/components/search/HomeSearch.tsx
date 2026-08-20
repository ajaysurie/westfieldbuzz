"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const HANDOFF_KEY = "westfieldbuzz:search-handoff";

export function storeSearchHandoff(query: string): void {
  const value = query.trim().slice(0, 400);
  if (value) window.sessionStorage.setItem(HANDOFF_KEY, value);
}

export function consumeSearchHandoff(): string {
  const value = window.sessionStorage.getItem(HANDOFF_KEY) ?? "";
  window.sessionStorage.removeItem(HANDOFF_KEY);
  return value;
}

export default function HomeSearch({ starters }: { starters: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const go = (value: string) => {
    storeSearchHandoff(value);
    router.push("/search");
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    go(query);
  };
  return <>
    <form onSubmit={submit} className="event-search-form">
      <label htmlFor="home-search" className="sr-only">Search local events</label>
      <input id="home-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Something indoors Saturday for my 7-year-old" minLength={2} required />
      <button type="submit" aria-label="Search local events"><span aria-hidden="true">→</span></button>
    </form>
    <div className="search-starters" aria-label="Suggested searches">
      {starters.map((starter) => <button key={starter} type="button" onClick={() => go(starter)}>{starter}</button>)}
    </div>
  </>;
}
