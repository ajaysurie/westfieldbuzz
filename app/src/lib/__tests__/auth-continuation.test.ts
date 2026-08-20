import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authResumeDestination,
  clearAuthContinuation,
  createAuthContinuation,
  readAuthContinuation,
  safeLocalReturnPath,
  stripAuthContinuationParams,
} from "../auth-continuation";
import { emptySearchIntent } from "../search/event-intent";

let store: Record<string, string>;
beforeEach(() => {
  store = {};
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; },
    },
  });
});
afterEach(() => window.localStorage.clear());

describe("auth continuation", () => {
  it("only accepts safe local return paths", () => {
    expect(safeLocalReturnPath("/events/a?x=1#save")).toBe("/events/a?x=1#save");
    for (const unsafe of ["https://evil.test", "//evil.test", "/%2F%2Fevil.test", "/\\evil", "/a\n", "javascript:alert(1)"]) {
      expect(safeLocalReturnPath(unsafe)).toBe("/");
    }
  });

  it("adds only a validated opaque continuation id to the resume path", () => {
    const id = "9f5eb2e2-2c50-41c8-8c8a-a23d7fac2a12";
    expect(authResumeDestination("/events/a?view=calendar", id)).toBe(`/events/a?view=calendar&continuation=${id}&mode=resume`);
    expect(authResumeDestination("/events/a?view=calendar", id, "cancel")).toBe(`/events/a?view=calendar&continuation=${id}&mode=cancel`);
    expect(authResumeDestination(`/events/a?continuation=search+text`, "not-an-id")).toBe("/events/a");
  });

  it("strips only continuation state from a local target", () => {
    expect(stripAuthContinuationParams("/events/a?view=calendar&continuation=opaque&mode=cancel#details"))
      .toBe("/events/a?view=calendar#details");
  });

  it("keeps the action in a versioned local envelope, not in its id", () => {
    const id = createAuthContinuation({ kind: "save-search", searchId: "search_abc12345", label: "Music · Westfield", intent: emptySearchIntent() }, "/search");
    expect(id).toMatch(/^[a-f0-9-]+$/i);
    expect(id).not.toContain("Music");
    expect(readAuthContinuation(id)?.action).toMatchObject({ kind: "save-search", label: "Music · Westfield" });
    clearAuthContinuation(id);
    expect(readAuthContinuation(id)).toBeNull();
  });

  it("does not persist or route the original natural-language search text", () => {
    const rawText = "free music for my seven year old near home";
    const intent = { ...emptySearchIntent(), categories: ["Music" as const], towns: ["Westfield"] };
    const id = createAuthContinuation(
      { kind: "save-search", searchId: "search_abc12345", label: "Music · Westfield", intent },
      "/search"
    );
    const serialized = window.localStorage.getItem(`westfieldbuzz:continuation:${id}`) ?? "";
    expect(serialized).not.toContain(rawText);
    expect(authResumeDestination("/search", id)).not.toContain(rawText);
  });

  it("drops malformed or expired envelopes", () => {
    const id = "9f5eb2e2-2c50-41c8-8c8a-a23d7fac2a12";
    window.localStorage.setItem(`westfieldbuzz:continuation:${id}`, JSON.stringify({ version: 1, createdAt: 0, returnTo: "/", action: { kind: "save-event", eventId: "one" } }));
    expect(readAuthContinuation(id)).toBeNull();
    expect(window.localStorage.getItem(`westfieldbuzz:continuation:${id}`)).toBeNull();
  });
});
