import { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthContinuation } from "../auth-continuation";

const firebaseMocks = vi.hoisted(() => ({
  authListener: null as ((user: unknown) => void) | null,
  getRedirectResult: vi.fn(),
  signInWithEmailLink: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
}));

let store: Record<string, string>;

vi.mock("../firebase", () => ({
  auth: {},
  db: {},
  facebookProvider: {},
  googleProvider: {},
}));

vi.mock("firebase/auth", () => ({
  getRedirectResult: firebaseMocks.getRedirectResult,
  isSignInWithEmailLink: vi.fn(() => true),
  linkWithPopup: vi.fn(),
  onAuthStateChanged: vi.fn((_auth, listener) => {
    firebaseMocks.authListener = listener;
    return vi.fn();
  }),
  sendSignInLinkToEmail: vi.fn(),
  signInWithEmailLink: firebaseMocks.signInWithEmailLink,
  signInWithPopup: firebaseMocks.signInWithPopup,
  signInWithRedirect: firebaseMocks.signInWithRedirect,
  signOut: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
}));

async function renderAuth(userAgent: string) {
  vi.resetModules();
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: userAgent });
  const authModule = await import("../auth");
  const { AuthProvider, useAuth } = authModule;
  let context: ReturnType<typeof useAuth> | null = null;

  function Probe() {
    const value = useAuth();
    useEffect(() => {
      context = value;
    }, [value]);
    return null;
  }

  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(firebaseMocks.authListener).not.toBeNull());
  await act(async () => { firebaseMocks.authListener?.(null); });
  return { getAuth: () => context!, readStoredAuthResume: authModule.readStoredAuthResume };
}

beforeEach(() => {
  vi.clearAllMocks();
  firebaseMocks.authListener = null;
  firebaseMocks.getRedirectResult.mockResolvedValue(null);
  firebaseMocks.signInWithPopup.mockResolvedValue({});
  firebaseMocks.signInWithRedirect.mockResolvedValue(undefined);
  firebaseMocks.signInWithEmailLink.mockResolvedValue({});
  store = {};
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => { store = {}; },
      getItem: (key: string) => store[key] ?? null,
      removeItem: (key: string) => { delete store[key]; },
      setItem: (key: string, value: string) => { store[key] = value; },
    },
  });
  window.history.replaceState({}, "", "/login");
});

describe("AuthProvider continuation handoff", () => {
  const continuationId = "9f5eb2e2-2c50-41c8-8c8a-a23d7fac2a12";

  it("keeps the opaque id with a same-device Google popup sign-in", async () => {
    const { getAuth } = await renderAuth("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)");
    await act(async () => { await getAuth().loginWithGoogle("/events/a?view=calendar", continuationId); });

    expect(firebaseMocks.signInWithPopup).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("westfieldbuzz:returnTo")).toBe("/events/a?view=calendar");
    expect(window.localStorage.getItem("westfieldbuzz:authContinuation")).toBe(continuationId);
  });

  it("keeps the opaque id in storage for a mobile Google redirect return", async () => {
    const { getAuth } = await renderAuth("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    await act(async () => { await getAuth().loginWithGoogle("/events/a", continuationId); });

    expect(firebaseMocks.signInWithRedirect).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("westfieldbuzz:returnTo")).toBe("/events/a");
    expect(window.localStorage.getItem("westfieldbuzz:authContinuation")).toBe(continuationId);
  });

  it("returns an email-link completion to the opaque continuation when its local payload exists", async () => {
    const { getAuth } = await renderAuth("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)");
    const id = createAuthContinuation({ kind: "save-event", eventId: "event-1" }, "/events/a");
    expect(id).toBeTruthy();
    window.history.replaceState({}, "", `/auth/finish?returnTo=%2Fevents%2Fa&continuation=${id}`);

    await expect(getAuth().completeEmailLink("ajay@example.com")).resolves.toEqual({
      destination: `/events/a?continuation=${id}&mode=resume`,
      continuationMissing: false,
    });
  });

  it("does not append a continuation when an email-link payload is unavailable on this device", async () => {
    const { getAuth } = await renderAuth("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)");
    window.history.replaceState({}, "", `/auth/finish?returnTo=%2Fevents%2Fa&continuation=${continuationId}`);

    await expect(getAuth().completeEmailLink("ajay@example.com")).resolves.toEqual({
      destination: "/events/a",
      continuationMissing: true,
    });
  });

  it("clears the stored resume after a canceled Google popup", async () => {
    const { getAuth } = await renderAuth("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)");
    firebaseMocks.signInWithPopup.mockRejectedValueOnce({ code: "auth/popup-closed-by-user" });

    await act(async () => { await getAuth().loginWithGoogle("/events/a", continuationId); });

    expect(window.localStorage.getItem("westfieldbuzz:returnTo")).toBeNull();
    expect(window.localStorage.getItem("westfieldbuzz:authContinuation")).toBeNull();
  });

  it("clears the stored resume when starting a mobile redirect fails", async () => {
    const { getAuth } = await renderAuth("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    firebaseMocks.signInWithRedirect.mockRejectedValueOnce(new Error("redirect failed"));

    await act(async () => { await getAuth().loginWithGoogle("/events/a", continuationId); });

    expect(window.localStorage.getItem("westfieldbuzz:returnTo")).toBeNull();
    expect(window.localStorage.getItem("westfieldbuzz:authContinuation")).toBeNull();
  });

  it("ignores and removes a stored continuation whose local payload has expired", async () => {
    const { readStoredAuthResume } = await renderAuth("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)");
    window.localStorage.setItem("westfieldbuzz:returnTo", "/events/a");
    window.localStorage.setItem("westfieldbuzz:authContinuation", continuationId);
    window.localStorage.setItem(`westfieldbuzz:continuation:${continuationId}`, JSON.stringify({
      version: 1,
      createdAt: 0,
      returnTo: "/events/a",
      action: { kind: "save-event", eventId: "event-1" },
    }));

    expect(readStoredAuthResume()).toEqual({ returnTo: "/events/a", continuation: null });
    expect(window.localStorage.getItem("westfieldbuzz:authContinuation")).toBeNull();
    expect(window.localStorage.getItem(`westfieldbuzz:continuation:${continuationId}`)).toBeNull();
  });
});
