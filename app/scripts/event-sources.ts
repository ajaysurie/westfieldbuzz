export interface EventSource {
  id: string;
  name: string;
  type: "libcal" | "civicplus-ical";
  url: string;
  calendarId?: string;
  calendarIds?: number[];
  town: string;
  autoApprove: boolean;
}

export const EVENT_SOURCES: EventSource[] = [
  {
    id: "wml-libcal",
    name: "Westfield Memorial Library",
    type: "libcal",
    url: "https://events.wmlnj.org/ajax/calendar/list",
    calendarId: "15909",
    town: "Westfield",
    autoApprove: true,
  },
  {
    id: "summit-libcal",
    name: "Summit Free Public Library",
    type: "libcal",
    url: "https://summitlibrary.libcal.com/ajax/calendar/list",
    calendarId: "12857",
    town: "Summit",
    autoApprove: true,
  },
  {
    id: "westfield-gov-downtown",
    name: "Downtown Westfield Events",
    type: "civicplus-ical",
    url: "https://www.westfieldnj.gov/common/modules/iCalendar/iCalendar.aspx",
    calendarIds: [44],
    town: "Westfield",
    autoApprove: true,
  },
  {
    id: "westfield-gov-municipal",
    name: "Westfield Municipal Events",
    type: "civicplus-ical",
    url: "https://www.westfieldnj.gov/common/modules/iCalendar/iCalendar.aspx",
    calendarIds: [25],
    town: "Westfield",
    autoApprove: true,
  },
  {
    id: "westfield-gov-recreation",
    name: "Westfield Recreation Events",
    type: "civicplus-ical",
    url: "https://www.westfieldnj.gov/common/modules/iCalendar/iCalendar.aspx",
    calendarIds: [46],
    town: "Westfield",
    autoApprove: true,
  },
];

// Map source categories to WestfieldBuzz event categories
export const CATEGORY_MAP: Record<string, string> = {
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

export function mapCategory(sourceCategories: string[]): string {
  for (const cat of sourceCategories) {
    const mapped = CATEGORY_MAP[cat];
    if (mapped) return mapped;
  }
  return "Community"; // default
}
