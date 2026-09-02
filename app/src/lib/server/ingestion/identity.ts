import { createHash } from "node:crypto";

import type { SourceObservation } from "./types";

/**
 * This version is intentionally part of the persisted evidence. A future
 * identity policy can be introduced without changing the meaning of existing
 * registry documents.
 */
export const EVENT_IDENTITY_FINGERPRINT_VERSION = "event-identity/v1" as const;

export interface EventIdentityEvidence {
  version: typeof EVENT_IDENTITY_FINGERPRINT_VERSION;
  title: string;
  startAt: string;
  venue: string;
  town: string;
}

export interface EventIdentityFingerprint {
  version: typeof EVENT_IDENTITY_FINGERPRINT_VERSION;
  hash: string;
  evidence: EventIdentityEvidence;
}

/**
 * Keep this deliberately locale-independent. `toLocaleLowerCase` would make
 * the same source data fingerprint differently on hosts with different
 * default locales.
 */
export function canonicalIdentityText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
}

function isVirtualEvent(observation: Pick<SourceObservation, "title" | "location">): boolean {
  return /\b(virtual|online|zoom)\b/i.test(`${observation.title} ${observation.location}`);
}

export function eventIdentityFingerprint(
  observation: Pick<SourceObservation, "title" | "date" | "location" | "town">
): EventIdentityFingerprint {
  // A syndicated online talk has no meaningful venue. Library feeds commonly
  // substitute their own branch name, which previously let the same talk claim
  // a different fingerprint in every feed.
  const virtual = isVirtualEvent(observation);
  const evidence: EventIdentityEvidence = {
    version: EVENT_IDENTITY_FINGERPRINT_VERSION,
    title: canonicalIdentityText(observation.title),
    startAt: observation.date.toISOString(),
    venue: virtual ? "virtual" : canonicalIdentityText(observation.location),
    town: virtual ? "" : canonicalIdentityText(observation.town),
  };
  return {
    version: EVENT_IDENTITY_FINGERPRINT_VERSION,
    hash: createHash("sha256").update(JSON.stringify(evidence)).digest("hex"),
    evidence,
  };
}
