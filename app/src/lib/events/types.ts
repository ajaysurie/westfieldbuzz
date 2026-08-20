export const EVENT_CATEGORIES = [
  "Family & Kids",
  "Arts & Culture",
  "Sports & Recreation",
  "Music",
  "Food & Drink",
  "Community",
  "Health & Wellness",
  "Entertainment",
  "History",
  "Markets",
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export type EventStatus =
  | "scheduled"
  | "cancelled"
  | "postponed"
  | "rescheduled"
  | "weather-dependent";

export type EventAvailability =
  | "available"
  | "registration-required"
  | "waitlist"
  | "sold-out"
  | "unknown";

export type EventFreshness = "current" | "missing" | "stale";

/** Only published projections are eligible for public calendar/search/digest reads. */
export type EventPublicationStatus = "published" | "suppressed" | "review-held";

/** Where the public projection came from. Manual records never invent a source URL. */
export type EventProvenance = "crawler" | "manual" | "candidate-review";

export interface ManualVerification<TDate = Date> {
  verifier: string;
  verifiedAt: TDate;
  /** Optional operator-provided evidence. This is not synthesized by the app. */
  evidenceUrl?: string;
}

/** Facts used as hard search filters must carry explicit source evidence. */
export type EventFactName = "age" | "cost" | "environment" | "registration" | "accessibility" | "travelTime";
export type EventFactEvidence = Partial<Record<EventFactName, "known" | "unknown">>;

export interface EventFacts<TDate = Date> {
  title: string;
  description: string;
  date: TDate;
  endDate: TDate | null;
  location: string;
  town: string;
  category: EventCategory;
  status: EventStatus;
  availability: EventAvailability;
  sourceId: string;
  sourceEventId: string;
  sourceUrl: string;
  /** A real photo from the source, when it supplies one. Rendered over the
   *  category illustration fallback. Absolute http(s) URL only. */
  imageUrl?: string;
  factEvidence?: EventFactEvidence;
}

export interface EventDocument<TDate = Date> extends EventFacts<TDate> {
  publicationStatus: EventPublicationStatus;
  freshnessStatus: EventFreshness;
  lastSeenAt: TDate;
  lastVerifiedAt: TDate;
  missingSince: TDate | null;
  missingRunCount: number;
  provenance?: EventProvenance;
  manualVerification?: ManualVerification<TDate>;
  /** A suppression survives crawler refreshes and retains all source evidence. */
  suppressedAt?: TDate;
  suppressedBy?: string;
  suppressionReason?: string;
  reviewHeldAt?: TDate;
  /** Former source identities retained when an upstream feed changes its key. */
  sourceEventAliases?: string[];
  manualOverrides?: Partial<
    Pick<
      EventFacts<TDate>,
      | "title"
      | "description"
      | "date"
      | "endDate"
      | "location"
      | "town"
      | "category"
      | "status"
      | "availability"
      | "sourceUrl"
    >
  >;
}
