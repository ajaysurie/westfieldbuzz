import { normalizeCategory } from "../../events/normalize";
import type { EventCategory } from "../../events/types";
import type { EventSourcePolicy } from "./types";

const STANDARD_FETCH = {
  timezone: "America/New_York",
  missingGraceRuns: 2,
  timeoutMs: 12_000,
  maxResponseBytes: 2_000_000,
  anomalyFloorRatio: 0.25,
  freshnessThresholdHours: 36,
} as const;

export const EVENT_SOURCES: EventSourcePolicy[] = [
  {
    ...STANDARD_FETCH,
    id: "wml-libcal",
    name: "Westfield Memorial Library",
    type: "libcal",
    url: "https://events.wmlnj.org/ajax/calendar/list",
    publicUrl: "https://events.wmlnj.org/",
    calendarId: "15909",
    town: "Westfield",
    autoApprove: true,
    group: "core-libraries",
    allowedHosts: ["events.wmlnj.org"],
    expectedContentTypes: ["application/json", "text/json"],
    minimumExpectedEvents: 1,
    junkTitlePatterns: [
      "^space rental$",
      "^table(?: \\d+)?$",
      "^room reservation$",
    ],
  },
  {
    ...STANDARD_FETCH,
    id: "summit-libcal",
    name: "Summit Free Public Library",
    type: "libcal",
    url: "https://summitlibrary.libcal.com/ajax/calendar/list",
    publicUrl: "https://summitlibrary.libcal.com/calendar",
    calendarId: "12857",
    town: "Summit",
    autoApprove: true,
    group: "core-libraries",
    allowedHosts: ["summitlibrary.libcal.com"],
    expectedContentTypes: ["application/json", "text/json"],
    minimumExpectedEvents: 1,
    junkTitlePatterns: [
      "^space rental$",
      "^table(?: \\d+)?$",
      "^room reservation$",
    ],
  },
  {
    ...STANDARD_FETCH,
    id: "westfield-gov-downtown",
    name: "Downtown Westfield Events",
    type: "civicplus-ical",
    url: "https://www.westfieldnj.gov/common/modules/iCalendar/iCalendar.aspx",
    publicUrl: "https://www.westfieldnj.gov/calendar.aspx",
    calendarIds: [44],
    town: "Westfield",
    autoApprove: true,
    group: "core-town-school",
    allowedHosts: ["www.westfieldnj.gov", "westfieldnj.gov"],
    expectedContentTypes: ["text/calendar", "application/octet-stream", "text/plain"],
    minimumExpectedEvents: 1,
  },
  {
    ...STANDARD_FETCH,
    id: "westfield-gov-municipal",
    name: "Westfield Municipal Events",
    type: "civicplus-ical",
    url: "https://www.westfieldnj.gov/common/modules/iCalendar/iCalendar.aspx",
    publicUrl: "https://www.westfieldnj.gov/calendar.aspx",
    calendarIds: [25],
    town: "Westfield",
    autoApprove: true,
    group: "core-town-school",
    allowedHosts: ["www.westfieldnj.gov", "westfieldnj.gov"],
    expectedContentTypes: ["text/calendar", "application/octet-stream", "text/plain"],
    minimumExpectedEvents: 1,
  },
  {
    ...STANDARD_FETCH,
    id: "westfield-gov-recreation",
    name: "Westfield Recreation Events",
    type: "civicplus-ical",
    url: "https://www.westfieldnj.gov/common/modules/iCalendar/iCalendar.aspx",
    publicUrl: "https://www.westfieldnj.gov/calendar.aspx",
    calendarIds: [46],
    town: "Westfield",
    autoApprove: true,
    group: "core-town-school",
    allowedHosts: ["www.westfieldnj.gov", "westfieldnj.gov"],
    expectedContentTypes: ["text/calendar", "application/octet-stream", "text/plain"],
    minimumExpectedEvents: 1,
  },
  {
    ...STANDARD_FETCH,
    id: "westfield-schools-ical",
    name: "Westfield Public Schools",
    type: "ical",
    url: "https://thrillshare-cmsv2.services.thrillshare.com/api/v4/o/10235/cms/events/generate_ical?filter_ids&section_ids=172521",
    publicUrl: "https://www.westfieldnjk12.org/events?section_ids=172521",
    town: "Westfield",
    autoApprove: true,
    group: "core-town-school",
    allowedHosts: ["thrillshare-cmsv2.services.thrillshare.com"],
    expectedContentTypes: ["text/calendar", "application/octet-stream", "text/plain"],
    minimumExpectedEvents: 1,
    junkTitlePatterns: [
      "^board of education office closed$",
      "^school closed$",
      "^district closed$",
    ],
  },
  {
    ...STANDARD_FETCH,
    id: "downtown-cranford-mec",
    name: "Downtown Cranford",
    type: "wordpress-mec-html",
    url: "https://downtowncranford.org/mecevents/",
    publicUrl: "https://downtowncranford.org/mecevents/",
    town: "Cranford",
    autoApprove: false,
    group: "nearby-venues",
    allowedHosts: ["downtowncranford.org", "www.downtowncranford.org"],
    expectedContentTypes: ["text/html", "application/xhtml+xml"],
    expectedLayoutMarker: "mec-event-article",
    minimumExpectedEvents: 1,
  },
  {
    ...STANDARD_FETCH,
    id: "nj-festival-orchestra-jsonld",
    name: "New Jersey Festival Orchestra",
    type: "jsonld",
    url: "https://www.njfestivalorchestra.org/concerts",
    publicUrl: "https://www.njfestivalorchestra.org/concerts",
    town: "Westfield",
    autoApprove: false,
    group: "nearby-venues",
    allowedHosts: ["njfestivalorchestra.org", "www.njfestivalorchestra.org"],
    expectedContentTypes: ["text/html", "application/xhtml+xml"],
    expectedLayoutMarker: "application/ld+json",
    minimumExpectedEvents: 1,
  },
  {
    ...STANDARD_FETCH,
    id: "westfield-on-weekends-jsonld",
    name: "Westfield On Weekends",
    type: "jsonld",
    url: "https://www.westfieldonweekends.com/",
    publicUrl: "https://www.westfieldonweekends.com/",
    town: "Westfield",
    autoApprove: false,
    group: "nearby-venues",
    allowedHosts: ["westfieldonweekends.com", "www.westfieldonweekends.com"],
    expectedContentTypes: ["text/html", "application/xhtml+xml"],
    expectedLayoutMarker: "application/ld+json",
    minimumExpectedEvents: 1,
  },
  {
    ...STANDARD_FETCH,
    id: "reeves-reed-jsonld",
    name: "Reeves-Reed Arboretum",
    type: "jsonld",
    url: "https://www.reeves-reedarboretum.org/",
    publicUrl: "https://www.reeves-reedarboretum.org/",
    town: "Summit",
    autoApprove: false,
    group: "nearby-venues",
    allowedHosts: ["reeves-reedarboretum.org", "www.reeves-reedarboretum.org"],
    expectedContentTypes: ["text/html", "application/xhtml+xml"],
    expectedLayoutMarker: "application/ld+json",
    minimumExpectedEvents: 1,
  },
  {
    ...STANDARD_FETCH,
    id: "ucpac-tribe",
    name: "Union County Performing Arts Center",
    type: "wordpress-tribe-json",
    url: "https://ucpac.org/wp-json/tribe/events/v1/events",
    publicUrl: "https://ucpac.org/events/",
    town: "Rahway",
    autoApprove: false,
    group: "nearby-venues",
    allowedHosts: ["ucpac.org", "www.ucpac.org"],
    expectedContentTypes: ["application/json", "text/json"],
    expectedLayoutMarker: "events",
    minimumExpectedEvents: 1,
  },
  {
    ...STANDARD_FETCH,
    id: "westfield-llm-search",
    name: "Web Search Discovery",
    type: "llm-search",
    // No page is fetched for this source; the URL is identity/attribution only.
    url: "https://westfieldbuzz.com/sources/web-search",
    publicUrl: "https://westfieldbuzz.com",
    town: "Westfield",
    autoApprove: false,
    group: "nearby-venues",
    allowedHosts: [],
    expectedContentTypes: [],
    minimumExpectedEvents: 0,
  },
];

export const SOURCE_GROUPS = [
  "core-libraries",
  "core-town-school",
  "nearby-venues",
] as const;

export type SourceGroup = (typeof SOURCE_GROUPS)[number];

export function isSourceGroup(value: string): value is SourceGroup {
  return SOURCE_GROUPS.includes(value as SourceGroup);
}

export function sourceById(id: string): EventSourcePolicy | undefined {
  return EVENT_SOURCES.find((source) => source.id === id);
}

export function sourcesForGroup(group: SourceGroup): EventSourcePolicy[] {
  return EVENT_SOURCES.filter((source) => source.group === group);
}

const CATEGORY_MAP: Record<string, EventCategory> = {
  Children: "Family & Kids",
  "Children's": "Family & Kids",
  Teen: "Family & Kids",
  Adult: "Community",
  Technology: "Community",
  "Book Club": "Community",
  Crafts: "Arts & Culture",
  Music: "Music",
  Film: "Entertainment",
  "Downtown Westfield Events": "Community",
  "Recreation Events": "Sports & Recreation",
  "Municipal Events": "Community",
  "Westfield Public Schools": "Family & Kids",
  "Rialto Center for Creativity": "Arts & Culture",
  "Westfield Historical Society": "History",
  "Downtown Cranford": "Community",
  "Union County Performing Arts Center": "Entertainment",
  General: "Community",
};

export function mapCategory(sourceCategories: string[]): EventCategory {
  for (const category of sourceCategories) {
    const mapped = CATEGORY_MAP[category];
    if (mapped) return mapped;
    const normalized = normalizeCategory(category);
    if (normalized !== "Community") return normalized;
  }
  return "Community";
}
