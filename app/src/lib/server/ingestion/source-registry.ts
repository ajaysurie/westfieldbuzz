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
      "^staff\\b",
      "^hold$",
      "^reserved\\b",
      "^booked$",
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
      "^staff\\b",
      "^hold$",
      "^reserved\\b",
      "^booked$",
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
    // 25 = Municipal Events, 43 = Lifelong Westfield (senior programming).
    calendarIds: [25, 43],
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
    // 46 = Recreation Events, 47 = Recreation - General. Both sit empty for
    // stretches; the source stays healthy because the minimum is zero.
    calendarIds: [46, 47],
    town: "Westfield",
    autoApprove: true,
    group: "core-town-school",
    allowedHosts: ["www.westfieldnj.gov", "westfieldnj.gov"],
    expectedContentTypes: ["text/calendar", "application/octet-stream", "text/plain"],
    minimumExpectedEvents: 0,
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
      "^schools? closed\\b",
      "^district closed",
      "^board meeting$",
      "staff in-?service",
      "begins (?:at )?sundown",
      "^yom kippur\\b",
      "^rosh hashanah",
      "^sukkot\\b",
      "^columbus day$",
      "^indigenous people",
      "^martin luther king",
      "^eastern orthodox",
      "^japanese new year",
      "^christm\\w+ eve$",
      "^new year'?s? day$",
      "^labor day$",
      "^memorial day$",
      "^veterans? day$",
      "^juneteenth",
      "^passover\\b",
      "^good friday$",
      "^eid\\b",
      "^thanksgiving",
      "break$",
      "conference",
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
    autoApprove: true,
    group: "nearby-venues",
    allowedHosts: ["downtowncranford.org", "www.downtowncranford.org"],
    expectedContentTypes: ["text/html", "application/xhtml+xml"],
    expectedLayoutMarker: "mec-event-article",
    minimumExpectedEvents: 1,
  },
  {
    ...STANDARD_FETCH,
    id: "nj-festival-orchestra-llm",
    name: "New Jersey Festival Orchestra",
    type: "llm-extract",
    url: "https://www.njfestivalorchestra.org/concerts",
    publicUrl: "https://www.njfestivalorchestra.org/concerts",
    town: "Westfield",
    // Model-backed sources stay in the review queue until an operator enables
    // publishing via config/sources.
    autoApprove: false,
    group: "nearby-venues",
    allowedHosts: ["njfestivalorchestra.org", "www.njfestivalorchestra.org"],
    expectedContentTypes: ["text/html", "application/xhtml+xml"],
    // Wix site: no JSON-LD, but season dates render server-side in the HTML.
    minimumExpectedEvents: 0,
  },
  {
    ...STANDARD_FETCH,
    id: "cranford-community-ical",
    name: "Cranford Community Events",
    type: "civicplus-ical",
    url: "https://www.cranfordnj.org/common/modules/iCalendar/iCalendar.aspx",
    publicUrl: "https://www.cranfordnj.org/calendar.aspx",
    // 14 = Main Calendar, 27 = Community Events.
    calendarIds: [14, 27],
    town: "Cranford",
    autoApprove: true,
    group: "nearby-venues",
    allowedHosts: ["www.cranfordnj.org", "cranfordnj.org"],
    expectedContentTypes: ["text/calendar", "application/octet-stream", "text/plain"],
    minimumExpectedEvents: 0,
  },
  {
    ...STANDARD_FETCH,
    id: "sopac-jsonld-index",
    name: "South Orange Performing Arts Center",
    type: "jsonld-index",
    url: "https://www.sopacnow.org/events/",
    publicUrl: "https://www.sopacnow.org/events/",
    town: "South Orange",
    autoApprove: true,
    group: "nearby-venues",
    allowedHosts: ["sopacnow.org", "www.sopacnow.org"],
    expectedContentTypes: ["text/html", "application/xhtml+xml"],
    detailLinkPattern: "^/events/(?!feed/)[a-z0-9][a-z0-9-]*/$",
    maxDetailPages: 40,
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
    autoApprove: true,
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
    autoApprove: true,
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
    group: "venue-search",
    allowedHosts: [],
    expectedContentTypes: [],
    minimumExpectedEvents: 0,
  },
  // Venue-level search sources for sites that block or client-render their
  // calendars — Comedy Cove 403s its schedule page, Crossroads rejects plain
  // fetches, Paper Mill sits behind Queue-it. Grounded web search reaches
  // their listings without touching the protected pages. Each runs one query
  // instead of the town-wide angle sweep.
  {
    ...STANDARD_FETCH,
    id: "comedy-cove-llm-search",
    name: "Comedy Cove",
    type: "llm-search",
    // The venue's domain is a parked GoDaddy page — there is no site to fetch.
    // Listings live on Facebook and Brown Paper Tickets; grounded search is
    // the only automated route. URL is the producer page for attribution.
    url: "https://www.brownpapertickets.com/producer/3588844",
    publicUrl: "https://www.brownpapertickets.com/producer/3588844",
    town: "Springfield",
    autoApprove: false,
    group: "venue-search",
    allowedHosts: [],
    expectedContentTypes: [],
    minimumExpectedEvents: 0,
    searchQueries: [
      "upcoming comedy shows and events at Comedy Cove in Springfield NJ",
    ],
  },
  {
    ...STANDARD_FETCH,
    id: "crossroads-eventbrite",
    name: "Crossroads",
    type: "eventbrite-organizer",
    // The venue tickets through Eventbrite; its organizer page embeds the
    // authoritative upcoming-events JSON in the initial page state.
    url: "https://www.eventbrite.com/o/crossroads-18337279677",
    publicUrl: "https://www.xxroads.com/calendar",
    town: "Garwood",
    autoApprove: true,
    group: "nearby-venues",
    allowedHosts: ["eventbrite.com", "www.eventbrite.com"],
    expectedContentTypes: ["text/html", "application/xhtml+xml"],
    expectedLayoutMarker: '"upcomingEvents"',
    minimumExpectedEvents: 0,
    junkTitlePatterns: ["^waiting\\s?list"],
  },
  {
    ...STANDARD_FETCH,
    id: "paper-mill-llm",
    name: "Paper Mill Playhouse",
    type: "llm-extract",
    // Queue-it guards the my.papermill.org ticketing flow, but the content
    // site is plain server-rendered WordPress and fetches cleanly. The season
    // slug rotates yearly; when it rolls over this source will fail visibly
    // on the layout check rather than publish stale records.
    url: "https://papermill.org/26-27_season/",
    publicUrl: "https://papermill.org/26-27_season/",
    town: "Millburn",
    autoApprove: false,
    group: "nearby-venues",
    allowedHosts: ["papermill.org", "www.papermill.org"],
    expectedContentTypes: ["text/html", "application/xhtml+xml"],
    expectedLayoutMarker: "BUY TICKETS",
    minimumExpectedEvents: 0,
  },
  {
    ...STANDARD_FETCH,
    id: "16-prospect-llm-search",
    name: "16 Prospect Wine Bar",
    type: "llm-search",
    url: "https://www.16prospect.com/",
    publicUrl: "https://www.16prospect.com/",
    town: "Westfield",
    autoApprove: false,
    group: "venue-search",
    allowedHosts: [],
    expectedContentTypes: [],
    minimumExpectedEvents: 0,
    searchQueries: [
      "upcoming live music and events at 16 Prospect Wine Bar in Westfield NJ",
    ],
  },
];

export const SOURCE_GROUPS = [
  "core-libraries",
  "core-town-school",
  "nearby-venues",
  "venue-search",
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
  "South Orange Performing Arts Center": "Entertainment",
  "New Jersey Festival Orchestra": "Music",
  "Crossroads": "Music",
  "Paper Mill Playhouse": "Entertainment",
  "Comedy Cove": "Entertainment",
  "16 Prospect Wine Bar": "Music",
  "Cranford Community Events": "Community",
  "Main Calendar": "Community",
  "Community Events": "Community",
  "Lifelong Westfield": "Community",
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
