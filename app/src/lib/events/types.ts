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
  | "rescheduled";

export type EventAvailability =
  | "available"
  | "registration-required"
  | "waitlist"
  | "sold-out"
  | "unknown";

export type EventFreshness = "current" | "missing" | "stale";

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
}

export interface EventDocument<TDate = Date> extends EventFacts<TDate> {
  publicationStatus: "published";
  freshnessStatus: EventFreshness;
  lastSeenAt: TDate;
  lastVerifiedAt: TDate;
  missingSince: TDate | null;
  missingRunCount: number;
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

