import type { EventDocument, EventFacts } from "../../events/types";

export interface EventSourcePolicy {
  id: string;
  name: string;
  type: "libcal" | "civicplus-ical";
  url: string;
  calendarId?: string;
  calendarIds?: number[];
  town: string;
  timezone: string;
  autoApprove: boolean;
  missingGraceRuns: number;
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

