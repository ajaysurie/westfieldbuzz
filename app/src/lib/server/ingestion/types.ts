import type { EventDocument, EventFacts } from "../../events/types";

export interface EventSourcePolicy {
  id: string;
  name: string;
  type:
    | "libcal"
    | "ical"
    | "civicplus-ical"
    | "jsonld"
    | "llm-extract"
    | "llm-search"
    | "squarespace-json"
    | "wordpress-mec-html"
    | "wordpress-tribe-json";
  url: string;
  publicUrl?: string;
  calendarId?: string;
  calendarIds?: number[];
  town: string;
  timezone: string;
  autoApprove: boolean;
  missingGraceRuns: number;
  group: "core-libraries" | "core-town-school" | "nearby-venues";
  allowedHosts: string[];
  expectedContentTypes: string[];
  timeoutMs: number;
  maxResponseBytes: number;
  expectedLayoutMarker?: string;
  minimumExpectedEvents?: number;
  anomalyFloorRatio?: number;
  freshnessThresholdHours: number;
  junkTitlePatterns?: string[];
}

export type SourceObservation = EventFacts<Date> & {
  /** Previous stable source keys that identify this same upstream occurrence. */
  sourceEventAliases?: string[];
};

export interface ExistingSourceEvent extends EventDocument<Date> {
  id: string;
  identityFingerprint?: string;
}

export type CreateReconciliationAction = {
  type: "create";
  eventId: null;
  observation: SourceObservation;
  event: EventDocument<Date>;
  changedFields: string[];
};

export type ExistingObservedReconciliationAction = {
  type: "update" | "verify";
  eventId: string;
  observation: SourceObservation;
  event: EventDocument<Date>;
  changedFields: string[];
  previousIdentityFingerprint?: string;
};

export type ObservedReconciliationAction =
  | CreateReconciliationAction
  | ExistingObservedReconciliationAction;

export type ReconciliationAction =
  | ObservedReconciliationAction
  | {
      type: "missing" | "stale";
      eventId: string;
      event: EventDocument<Date>;
      changedFields: string[];
    }
  | {
      type: "safety-held";
      observation: SourceObservation;
      reason:
        | "ambiguous-source-event-alias"
        | "possible-cross-source-duplicate"
        | "fingerprint-registry-inconsistency"
        | "existing-event-conflict";
      matchingEventIds: string[];
      matchingSourceIds?: string[];
    };

export interface ReconciliationPlan {
  actions: ReconciliationAction[];
  created: number;
  updated: number;
  verified: number;
  missing: number;
  stale: number;
  safetyHeld: number;
}

export interface SourceFetchResult {
  events: SourceObservation[];
  complete: boolean;
  errors: string[];
  warnings: string[];
  responseBytes: number;
  fetchedUrl: string;
}

export interface SourceRunResult {
  sourceId: string;
  sourceName: string;
  status: "success" | "partial" | "failed";
  fetched: number;
  created: number;
  updated: number;
  verified: number;
  missing: number;
  stale: number;
  candidates: number;
  safetyHeld: boolean;
  errors: string[];
  warnings: string[];
  durationMs: number;
  /** The runner stopped before all planned writes could safely start. */
  incomplete?: boolean;
}
