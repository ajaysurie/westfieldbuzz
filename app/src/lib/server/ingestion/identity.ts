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

export function eventIdentityFingerprint(
  observation: Pick<SourceObservation, "title" | "date" | "location" | "town">
): EventIdentityFingerprint {
  const evidence: EventIdentityEvidence = {
    version: EVENT_IDENTITY_FINGERPRINT_VERSION,
    title: canonicalIdentityText(observation.title),
    startAt: observation.date.toISOString(),
    venue: canonicalIdentityText(observation.location),
    town: canonicalIdentityText(observation.town),
  };
  return {
    version: EVENT_IDENTITY_FINGERPRINT_VERSION,
    hash: createHash("sha256").update(JSON.stringify(evidence)).digest("hex"),
    evidence,
  };
}
