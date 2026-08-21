import { validateSearchIntent, type SearchIntent } from "@/lib/search/event-intent";

const STORAGE_PREFIX = "westfieldbuzz:continuation:";
const VERSION = 1;
const MAX_AGE_MS = 20 * 60 * 1000;
const CONTINUATION_ID_PATTERN = /^[a-f0-9-]{16,64}$/i;

export type ContinuationAction =
  | { kind: "save-event"; eventId: string }
  | { kind: "save-search"; searchId: string; label: string; intent: SearchIntent };

export interface AuthContinuation {
  version: typeof VERSION;
  createdAt: number;
  returnTo: string;
  action: ContinuationAction;
}

export type AuthContinuationMode = "resume" | "cancel";

/** Only application-relative, printable paths are allowed through auth. */
export function safeLocalReturnPath(value: string | null | undefined): string {
  if (!value || value.length > 2_048) return "/";
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return "/";
  }
  if (/[^\u0020-\u007e]/.test(value) || /[\u0000-\u001f\u007f]/.test(decoded)) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || decoded.startsWith("//") || value.includes("\\") || decoded.includes("\\")) return "/";
  try {
    const parsed = new URL(value, "https://westfieldbuzz.invalid");
    if (parsed.origin !== "https://westfieldbuzz.invalid") return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

export function isAuthContinuationId(value: string | null | undefined): value is string {
  return typeof value === "string" && CONTINUATION_ID_PATTERN.test(value);
}

/**
 * Builds the only auth resume URL shape: a safe local path with an optional,
 * opaque continuation id. Continuation payloads never enter the URL.
 */
export function authResumeDestination(
  returnTo: string | null | undefined,
  continuationId?: string | null,
  mode: AuthContinuationMode = "resume"
): string {
  const safeReturnTo = safeLocalReturnPath(returnTo);
  const parsed = new URL(safeReturnTo, "https://westfieldbuzz.invalid");
  parsed.searchParams.delete("continuation");
  parsed.searchParams.delete("mode");
  if (isAuthContinuationId(continuationId)) {
    parsed.searchParams.set("continuation", continuationId);
    parsed.searchParams.set("mode", mode);
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/** Removes only auth handoff state while retaining all other query/hash state. */
export function stripAuthContinuationParams(value: string | null | undefined): string {
  const safePath = safeLocalReturnPath(value);
  const parsed = new URL(safePath, "https://westfieldbuzz.invalid");
  parsed.searchParams.delete("continuation");
  parsed.searchParams.delete("mode");
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function isValidAction(value: unknown): value is ContinuationAction {
  if (!value || typeof value !== "object") return false;
  const action = value as Record<string, unknown>;
  if (action.kind === "save-event") {
    return typeof action.eventId === "string" && action.eventId.length > 0 && action.eventId.length <= 200;
  }
  if (action.kind === "save-search") {
    return (
      typeof action.searchId === "string" && /^[a-z0-9_-]{8,128}$/i.test(action.searchId) &&
      typeof action.label === "string" && action.label.length > 0 && action.label.length <= 160 &&
      validateSearchIntent(action.intent) !== null
    );
  }
  return false;
}

function isValidEnvelope(value: unknown, now = Date.now()): value is AuthContinuation {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Record<string, unknown>;
  return (
    envelope.version === VERSION &&
    typeof envelope.createdAt === "number" && Number.isFinite(envelope.createdAt) &&
    envelope.createdAt <= now && now - envelope.createdAt <= MAX_AGE_MS &&
    typeof envelope.returnTo === "string" && safeLocalReturnPath(envelope.returnTo) === envelope.returnTo &&
    isValidAction(envelope.action)
  );
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined") crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createAuthContinuation(action: ContinuationAction, returnTo: string): string | null {
  if (typeof window === "undefined" || !isValidAction(action)) return null;
  const id = randomId();
  const envelope: AuthContinuation = {
    version: VERSION,
    createdAt: Date.now(),
    returnTo: safeLocalReturnPath(returnTo),
    action,
  };
  window.localStorage.setItem(`${STORAGE_PREFIX}${id}`, JSON.stringify(envelope));
  return id;
}

export function readAuthContinuation(id: string | null | undefined): AuthContinuation | null {
  if (typeof window === "undefined" || !isAuthContinuationId(id)) return null;
  const key = `${STORAGE_PREFIX}${id}`;
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? "null");
    if (isValidEnvelope(value)) return value;
  } catch {
    // Treat malformed local data as absent and remove it below.
  }
  window.localStorage.removeItem(key);
  return null;
}

export function clearAuthContinuation(id: string | null | undefined): void {
  if (typeof window !== "undefined" && isAuthContinuationId(id)) {
    window.localStorage.removeItem(`${STORAGE_PREFIX}${id}`);
  }
}

export function continuationLoginHref(id: string, returnTo: string): string {
  const params = new URLSearchParams({ returnTo: safeLocalReturnPath(returnTo) });
  if (isAuthContinuationId(id)) params.set("continuation", id);
  return `/login?${params.toString()}`;
}
