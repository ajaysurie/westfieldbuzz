import type { EventDocument, EventFacts } from "../../events/types";

export interface EventSourcePolicy {
  id: string;
  name: string;
  type:
    | "libcal"
    | "ical"
    | "civicplus-ical"
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

export type SourceObservation = EventFacts<Date>;

export interface ExistingSourceEvent extends EventDocument<Date> {
  id: string;
}

export type ReconciliationAction =
  | {
      type: "create" | "update" | "verify";
      eventId: string | null;
      observation: SourceObservation;
      event: EventDocument<Date>;
      changedFields: string[];
    }
  | {
      type: "missing" | "stale";
      eventId: string;
      event: EventDocument<Date>;
      changedFields: string[];
    };

export interface ReconciliationPlan {
  actions: ReconciliationAction[];
  created: number;
  updated: number;
  verified: number;
  missing: number;
  stale: number;
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
}
