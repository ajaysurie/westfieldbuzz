import { normalizeCategory } from "../src/lib/events/normalize";
import type { EventCategory } from "../src/lib/events/types";
import type { EventSourcePolicy } from "../src/lib/server/ingestion/types";

export type EventSource = EventSourcePolicy;

export const EVENT_SOURCES: EventSource[] = [
  {
    id: "wml-libcal",
    name: "Westfield Memorial Library",
    type: "libcal",
    url: "https://events.wmlnj.org/ajax/calendar/list",
    calendarId: "15909",
    town: "Westfield",
    timezone: "America/New_York",
    autoApprove: true,
    missingGraceRuns: 2,
  },
  {
    id: "summit-libcal",
    name: "Summit Free Public Library",
    type: "libcal",
    url: "https://summitlibrary.libcal.com/ajax/calendar/list",
    calendarId: "12857",
    town: "Summit",
    timezone: "America/New_York",
    autoApprove: true,
    missingGraceRuns: 2,
  },
  {
    id: "westfield-gov-downtown",
    name: "Downtown Westfield Events",
    type: "civicplus-ical",
    url: "https://www.westfieldnj.gov/common/modules/iCalendar/iCalendar.aspx",
    calendarIds: [44],
    town: "Westfield",
    timezone: "America/New_York",
    autoApprove: true,
    missingGraceRuns: 2,
  },
  {
    id: "westfield-gov-municipal",
    name: "Westfield Municipal Events",
    type: "civicplus-ical",
    url: "https://www.westfieldnj.gov/common/modules/iCalendar/iCalendar.aspx",
    calendarIds: [25],
    town: "Westfield",
    timezone: "America/New_York",
    autoApprove: true,
    missingGraceRuns: 2,
  },
  {
    id: "westfield-gov-recreation",
    name: "Westfield Recreation Events",
    type: "civicplus-ical",
    url: "https://www.westfieldnj.gov/common/modules/iCalendar/iCalendar.aspx",
    calendarIds: [46],
    town: "Westfield",
    timezone: "America/New_York",
    autoApprove: true,
    missingGraceRuns: 2,
  },
];

// Map source categories to WestfieldBuzz event categories
export const CATEGORY_MAP: Record<string, EventCategory> = {
  // LibCal
  "Children": "Family & Kids",
  "Children's": "Family & Kids",
  "Teen": "Family & Kids",
  "Adult": "Community",
  "Technology": "Community",
  "Book Club": "Community",
  "Crafts": "Arts & Culture",
  "Music": "Arts & Culture",
  "Film": "Arts & Culture",
  // CivicPlus
  "Downtown Westfield Events": "Community",
  "Recreation Events": "Sports & Recreation",
  "Municipal Events": "Community",
  "General": "Community",
};

export function mapCategory(sourceCategories: string[]): EventCategory {
  for (const cat of sourceCategories) {
    const mapped = CATEGORY_MAP[cat];
    if (mapped) return mapped;
    const normalized = normalizeCategory(cat);
    if (normalized !== "Community") return normalized;
  }
  return "Community"; // default
}
