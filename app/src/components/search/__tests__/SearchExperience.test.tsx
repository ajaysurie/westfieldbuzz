import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SearchExperience from "../SearchExperience";
import type { SearchIntent } from "@/lib/search/event-intent";
import type { EventSearchSuccess } from "@/lib/search/search-contract";

const mocks = vi.hoisted(() => ({
  auth: { user: null as { uid: string } | null, loading: false },
  clearAuthContinuation: vi.fn(),
  readAuthContinuation: vi.fn(),
  saveSearch: vi.fn(),
  unsaveSearch: vi.fn(),
  isSearchSaved: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/auth-continuation", () => ({
  clearAuthContinuation: mocks.clearAuthContinuation,
  readAuthContinuation: mocks.readAuthContinuation,
  createAuthContinuation: vi.fn(() => "d8ab02f1-9e7e-4dc5-9c01-849b5d08dc23"),
  continuationLoginHref: vi.fn(() => "/login?continuation=opaque"),
  stripAuthContinuationParams: (value: string) => {
    const url = new URL(value, "http://localhost");
    url.searchParams.delete("continuation");
    url.searchParams.delete("mode");
    return `${url.pathname}${url.search}${url.hash}`;
  },
}));
vi.mock("@/lib/personalization", () => ({
  getPreferences: vi.fn(async () => null),
  stableSearchId: () => "search_test",
  savedSearchLabel: () => "Saved event search",
  isSearchSaved: mocks.isSearchSaved,
  saveSearch: mocks.saveSearch,
  unsaveSearch: mocks.unsaveSearch,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.user = null;
  mocks.auth.loading = false;
  mocks.readAuthContinuation.mockReturnValue(null);
  mocks.isSearchSaved.mockResolvedValue(false);
  mocks.saveSearch.mockResolvedValue(undefined);
  mocks.unsaveSearch.mockResolvedValue(undefined);
  window.history.replaceState({}, "", "/search");
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function successPayload(query: string): EventSearchSuccess {
  return {
    ok: true,
    query,
    intent: {
      version: 1,
      timeZone: "America/New_York",
      dateWindow: null,
      timeOfDay: [],
      partyAges: [],
      categories: [],
      towns: [],
      maxDriveMinutes: null,
      budget: null,
      environment: null,
      registration: null,
      availability: [],
      accessibility: [],
      keywords: [query],
      exclusions: { categories: [], keywords: [] },
      ambiguities: [],
    },
    results: [],
    fallbackUsed: true,
    ambiguities: [],
    suggestions: [],
    meta: { matchedCount: 0, candidateCount: 0, durationMs: 3 },
  };
}

function intentWith(overrides: Partial<SearchIntent>): SearchIntent {
  return { ...successPayload("").intent, ...overrides };
}

function continuationEnvelope(intent: SearchIntent) {
  return {
    version: 1,
    createdAt: Date.now(),
    returnTo: "/search?view=compact",
    action: {
      kind: "save-search",
      searchId: "search_test",
      label: "Music · Westfield",
      intent,
    },
  };
}

describe("SearchExperience", () => {
  it("runs a homepage query supplied in the URL", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify(successPayload("Free this weekend")),
        { status: 200 }
      )
    );
    render(<SearchExperience initialQuery="Free this weekend" />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/event-search",
      expect.objectContaining({ method: "POST" })
    ));
    expect(screen.getByDisplayValue("Free this weekend")).toBeInTheDocument();
    expect(await screen.findByText("No exact matches yet")).toBeInTheDocument();
  });

  it("keeps the latest result when overlapping requests finish in reverse order", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    let firstSignal: AbortSignal | null | undefined;
    vi.spyOn(global, "fetch")
      .mockImplementationOnce((_url, init) => {
        firstSignal = init?.signal;
        return first.promise;
      })
      .mockImplementationOnce(() => second.promise);

    render(<SearchExperience />);
    fireEvent.click(screen.getByRole("button", { name: "Free live music Friday night" }));
    fireEvent.click(screen.getByRole("button", { name: "Indoors Saturday morning for a 5-year-old" }));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(firstSignal?.aborted).toBe(true);

    await act(async () => {
      second.resolve(new Response(JSON.stringify(successPayload("latest search")), { status: 200 }));
    });
    expect(await screen.findByText("No exact matches yet")).toBeInTheDocument();

    await act(async () => {
      first.resolve(new Response(JSON.stringify({
        ok: false,
        error: { code: "inventory_unavailable", message: "Stale request failed" },
      }), { status: 503 }));
    });

    await waitFor(() => expect(screen.queryByText("Stale request failed")).not.toBeInTheDocument());
    expect(screen.getByDisplayValue("Indoors Saturday morning for a 5-year-old")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();
  });

  it("restores the exact structured intent, saves once, then clears a resumed continuation", async () => {
    const id = "d8ab02f1-9e7e-4dc5-9c01-849b5d08dc23";
    const intent = intentWith({ categories: ["Music"], towns: ["Westfield"], keywords: ["jazz"] });
    mocks.auth.user = { uid: "user-1" };
    mocks.readAuthContinuation.mockReturnValue(continuationEnvelope(intent));
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ ...successPayload(""), intent }), { status: 200 })
    );
    window.history.replaceState({}, "", `/search?view=compact&continuation=${id}&mode=resume`);

    render(<SearchExperience />);

    await waitFor(() => expect(mocks.saveSearch).toHaveBeenCalledWith(
      "user-1", "search_test", "Music · Westfield", intent
    ));
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body).toEqual({ mode: "structured", intent });
    expect(mocks.clearAuthContinuation).toHaveBeenCalledTimes(1);
    expect(window.location.pathname + window.location.search).toBe("/search?view=compact");
    expect(screen.getByDisplayValue("Music · Westfield")).toBeInTheDocument();
  });

  it("restores on cancel without saving, then clears the continuation", async () => {
    const id = "d8ab02f1-9e7e-4dc5-9c01-849b5d08dc23";
    const intent = intentWith({ categories: ["Music"], keywords: ["jazz"] });
    mocks.readAuthContinuation.mockReturnValue(continuationEnvelope(intent));
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ...successPayload(""), intent }), { status: 200 })
    );
    window.history.replaceState({}, "", `/search?view=compact&continuation=${id}&mode=cancel`);

    render(<SearchExperience />);

    expect(await screen.findByText("Search restored without saving.")).toBeInTheDocument();
    expect(mocks.saveSearch).not.toHaveBeenCalled();
    expect(mocks.clearAuthContinuation).toHaveBeenCalledWith(id);
    expect(window.location.pathname + window.location.search).toBe("/search?view=compact");
  });

  it("keeps a failed resumed action retryable and clears it only after success", async () => {
    const id = "d8ab02f1-9e7e-4dc5-9c01-849b5d08dc23";
    const intent = intentWith({ towns: ["Westfield"], keywords: ["family"] });
    mocks.auth.user = { uid: "user-1" };
    mocks.readAuthContinuation.mockReturnValue(continuationEnvelope(intent));
    mocks.saveSearch.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ ...successPayload(""), intent }), { status: 200 })
    );
    window.history.replaceState({}, "", `/search?continuation=${id}&mode=resume`);

    render(<SearchExperience />);
    expect(await screen.findByText("We could not save this search. Try again.")).toBeInTheDocument();
    expect(mocks.clearAuthContinuation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(mocks.saveSearch).toHaveBeenCalledTimes(2));
    expect(mocks.clearAuthContinuation).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("");
  });

  it("applies chip removal through structured execution", async () => {
    const firstIntent = intentWith({ categories: ["Music"] });
    const secondIntent = intentWith({ ...firstIntent, categories: [] });
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...successPayload("music"), intent: firstIntent }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...successPayload(""), intent: secondIntent }), { status: 200 }));

    render(<SearchExperience initialQuery="music" />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Music filter" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
    expect(body).toEqual({ mode: "structured", intent: secondIntent });
  });
});
