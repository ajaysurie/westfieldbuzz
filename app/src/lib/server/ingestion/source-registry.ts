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
    // Model-backed sources publish directly — the operator opted out of the
    // review queue (Sept 2026).
    autoApprove: true,
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
    autoApprove: true,
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
    autoApprove: true,
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
    autoApprove: true,
    group: "nearby-venues",
    allowedHosts: ["papermill.org", "www.papermill.org"],
    expectedContentTypes: ["text/html", "application/xhtml+xml"],
    expectedLayoutMarker: "BUY TICKETS",
    minimumExpectedEvents: 0,
  },
  // Instagram-only venues. Event content lives in post captions behind the
  // login wall; INSTAGRAM_COOKIE (the instagram.com cookie header exported
  // from the operator's browser into env) unlocks the web_profile_info
  // endpoint over plain HTTP, so these run on the venue-search cron. Without
  // the env var the adapter falls back to the local `browse` session. Results
  // are model-extracted and publish directly — no manual review step.
  // (16 Prospect was the first source here; it closed permanently in early
  // 2026 and is removed.)
  {
    ...STANDARD_FETCH,
    id: "stage-house-instagram",
    name: "Stage House Tavern",
    type: "instagram-profile",
    url: "https://www.instagram.com/stagehousetavern/",
    publicUrl: "https://www.instagram.com/stagehousetavern/",
    town: "Scotch Plains",
    autoApprove: true,
    group: "venue-search",
    allowedHosts: ["instagram.com", "www.instagram.com", "i.instagram.com"],
    expectedContentTypes: ["application/json"],
    minimumExpectedEvents: 0,
    maxPosts: 12,
  },
  // Bars, breweries, and restaurants sweep (Sept 2026). Verified by probing
  // each profile through the browse session or fetching its events page:
  // skipped venues had no dated public event content (Cranford Hotel posts
  // menu promos, Sheelen's Crossing IG went quiet in 2023, Fox & Falcon has
  // an empty lander and zero posts, Wet Ticket's own /events page renders
  // no dates client-side).
  {
    ...STANDARD_FETCH,
    id: "bull-n-bear-events",
    name: "Bull n Bear Brewery",
    type: "llm-extract",
    // Server-rendered show list: band name, date, time, cover — no JSON-LD,
    // but the text layout is stable and the extractor reads it directly.
    url: "https://bullnbearbrewery.com/events/",
    publicUrl: "https://bullnbearbrewery.com/events/",
    town: "Summit",
    autoApprove: true,
    group: "venue-search",
    allowedHosts: ["bullnbearbrewery.com", "www.bullnbearbrewery.com"],
    expectedContentTypes: ["text/html", "application/xhtml+xml"],
    expectedLayoutMarker: "No cover",
    minimumExpectedEvents: 0,
  },
  {
    ...STANDARD_FETCH,
    id: "wet-ticket-llm-search",
    name: "Wet Ticket Brewing",
    type: "llm-search",
    // The venue's /events page is client-rendered and its Instagram grid is
    // nearly empty; listings surface through grounded web search instead.
    url: "https://www.wetticketbrewing.com/events",
    publicUrl: "https://www.wetticketbrewing.com/events",
    town: "Rahway",
    autoApprove: true,
    group: "venue-search",
    allowedHosts: [],
    expectedContentTypes: [],
    minimumExpectedEvents: 0,
    searchQueries: [
      "upcoming live music, trivia, and events at Wet Ticket Brewing in Rahway NJ",
    ],
  },
  {
    ...STANDARD_FETCH,
    id: "felina-summit-llm-search",
    name: "Felina Summit",
    type: "llm-search",
    // bylandmark.com happenings calendar 403s plain fetches; the restaurant's
    // wine dinners and classes are indexed by search.
    url: "https://bylandmark.com/restaurants/felina-summit/",
    publicUrl: "https://bylandmark.com/restaurants/felina-summit/",
    town: "Summit",
    autoApprove: true,
    group: "venue-search",
    allowedHosts: [],
    expectedContentTypes: [],
    minimumExpectedEvents: 0,
    searchQueries: [
      "upcoming wine dinners, classes, and events at Felina Summit restaurant NJ",
    ],
  },
  {
    ...STANDARD_FETCH,
    id: "deutscher-club-instagram",
    name: "Deutscher Club of Clark",
    type: "instagram-profile",
    // Active profile posting dated public events (fests, band nights).
    url: "https://www.instagram.com/deutscherclubofclark/",
    publicUrl: "https://www.instagram.com/deutscherclubofclark/",
    town: "Clark",
    autoApprove: true,
    group: "venue-search",
    allowedHosts: ["instagram.com", "www.instagram.com", "i.instagram.com"],
    expectedContentTypes: ["application/json"],
    minimumExpectedEvents: 0,
    maxPosts: 12,
  },
  {
    ...STANDARD_FETCH,
    id: "tomasello-cranford-instagram",
    name: "Tomasello Winery Cranford",
    type: "instagram-profile",
    // Posts monthly performer lineups naming the Cranford tasting room.
    url: "https://www.instagram.com/tomasellowinery/",
    publicUrl: "https://www.tomasellowinery.com/sips-sounds-cranford",
    town: "Cranford",
    autoApprove: true,
    group: "venue-search",
    allowedHosts: ["instagram.com", "www.instagram.com", "i.instagram.com"],
    expectedContentTypes: ["application/json"],
    minimumExpectedEvents: 0,
    maxPosts: 12,
  },
  {
    ...STANDARD_FETCH,
    id: "james-ward-instagram",
    name: "The James Ward Mansion",
    type: "instagram-profile",
    // Westfield event venue posting dated open houses and tours.
    url: "https://www.instagram.com/thejameswardmansion/",
    publicUrl: "https://www.jameswardmansion.com/",
    town: "Westfield",
    autoApprove: true,
    group: "venue-search",
    allowedHosts: ["instagram.com", "www.instagram.com", "i.instagram.com"],
    expectedContentTypes: ["application/json"],
    minimumExpectedEvents: 0,
    maxPosts: 12,
  },
  {
    ...STANDARD_FETCH,
    id: "fire-me-up-instagram",
    name: "Fire Me Up Studio",
    type: "instagram-profile",
    // Cranford studio posting dated classes and workshops.
    url: "https://www.instagram.com/firemeupstudio/",
    publicUrl: "https://www.firemeupstudio.com/",
    town: "Cranford",
    autoApprove: true,
    group: "venue-search",
    allowedHosts: ["instagram.com", "www.instagram.com", "i.instagram.com"],
    expectedContentTypes: ["application/json"],
    minimumExpectedEvents: 0,
    maxPosts: 12,
  },
  // Source expansion sweep (Sept 2026). Each URL below was verified to serve
  // a structured, server-rendered event listing with robots.txt allowing the
  // event pages. Patch and TAPinto were investigated and dropped: neither
  // publishes a machine-readable calendar, and both are already covered by
  // the westfield-llm-search discovery source.
  {
    ...STANDARD_FETCH,
    id: "ymca-westfield-llm",
    name: "Westfield Area YMCA",
    type: "llm-extract",
    // Drupal events listing (13 upcoming at verification); detail pages carry
    // explicit Date/Time/Location blocks. No ICS/RSS/API found.
    url: "https://westfieldynj.org/events",
    publicUrl: "https://westfieldynj.org/events",
    town: "Westfield",
    autoApprove: true,
    group: "nearby-venues",
    allowedHosts: ["westfieldynj.org", "www.westfieldynj.org"],
    expectedContentTypes: ["text/html", "application/xhtml+xml"],
    minimumExpectedEvents: 1,
  },
  {
    ...STANDARD_FETCH,
    id: "ucnj-cultural-llm",
    name: "Union County Cultural Events",
    type: "llm-extract",
    // County-run calendar covering Rahway/Cranford/Summit and beyond: date,
    // time, category, title, cost, venue name + address, all server-rendered
    // WordPress. The seasonal slug (/summer26/) rotates yearly; this durable
    // calendar page is the one to track.
    url: "https://ucnj.org/parks-recreation/cultural-heritage-affairs/event-calendar/",
    publicUrl: "https://ucnj.org/parks-recreation/cultural-heritage-affairs/event-calendar/",
    town: "Union County",
    autoApprove: true,
    group: "nearby-venues",
    allowedHosts: ["ucnj.org", "www.ucnj.org"],
    expectedContentTypes: ["text/html", "application/xhtml+xml"],
    minimumExpectedEvents: 1,
  },
  {
    ...STANDARD_FETCH,
    id: "fanwood-library-llm",
    name: "Fanwood Memorial Library",
    type: "llm-extract",
    // "Upcoming Events" section on the WordPress homepage (~10 listings at
    // verification: title, date, time, location). A "View All Events" page
    // exists but its URL was not exposed; the tribe REST endpoint
    // (/wp-json/tribe/events/v1/events) is worth probing as a future upgrade
    // to wordpress-tribe-json.
    url: "https://fanwoodlibrary.org/",
    publicUrl: "https://fanwoodlibrary.org/",
    town: "Fanwood",
    autoApprove: true,
    group: "core-libraries",
    allowedHosts: ["fanwoodlibrary.org", "www.fanwoodlibrary.org"],
    expectedContentTypes: ["text/html", "application/xhtml+xml"],
    minimumExpectedEvents: 1,
  },
  {
    ...STANDARD_FETCH,
    id: "great-awakening-eventbrite",
    name: "Great Awakening Brewing Company",
    type: "eventbrite-organizer",
    // Westfield brewery/taproom; "Top Organizer" with 420 total events and a
    // high cadence (trivia, live music, several events/month).
    url: "https://www.eventbrite.com/o/great-awakening-brewing-company-56039992073",
    town: "Westfield",
    autoApprove: true,
    group: "nearby-venues",
    allowedHosts: ["eventbrite.com", "www.eventbrite.com"],
    expectedContentTypes: ["text/html", "application/xhtml+xml"],
    expectedLayoutMarker: '"upcomingEvents"',
    minimumExpectedEvents: 0,
  },
  {
    ...STANDARD_FETCH,
    id: "streetfairs-eventbrite",
    name: "StreetFairs.org",
    type: "eventbrite-organizer",
    // Runs the Westfield Street Fair & Craft Show 3x/year (spring/summer/
    // fall on South Ave W & Boulevard). Low volume, tentpole downtown events.
    url: "https://www.eventbrite.com/o/streetfairsorg-18458243538",
    town: "Westfield",
    autoApprove: true,
    group: "nearby-venues",
    allowedHosts: ["eventbrite.com", "www.eventbrite.com"],
    expectedContentTypes: ["text/html", "application/xhtml+xml"],
    expectedLayoutMarker: '"upcomingEvents"',
    minimumExpectedEvents: 0,
  },
  {
    ...STANDARD_FETCH,
    id: "cdc-theatre-llm",
    name: "CDC Theatre",
    type: "llm-extract",
    // Cranford Dramatic Club, 78 Winans Ave, Cranford — NJ's longest
    // continuously producing community theatre (est. 1919). Season model:
    // ~3 musicals + a play + special events; announce ~1x/year.
    url: "https://cdctheatre.org",
    publicUrl: "https://cdctheatre.org",
    town: "Cranford",
    autoApprove: true,
    group: "nearby-venues",
    allowedHosts: ["cdctheatre.org", "www.cdctheatre.org"],
    expectedContentTypes: ["text/html", "application/xhtml+xml"],
    minimumExpectedEvents: 0,
  },
  {
    ...STANDARD_FETCH,
    id: "wcp-theatre-llm",
    name: "Westfield Community Players",
    type: "llm-extract",
    // 1000 North Ave W, Westfield (est. 1934). ~4 productions/season plus
    // auditions. Tickets via Arts-People; a dedicated adapter is only worth
    // it if volume justifies.
    url: "https://www.wcptheatre.org",
    publicUrl: "https://www.wcptheatre.org",
    town: "Westfield",
    autoApprove: true,
    group: "nearby-venues",
    allowedHosts: ["wcptheatre.org", "www.wcptheatre.org"],
    expectedContentTypes: ["text/html", "application/xhtml+xml"],
    minimumExpectedEvents: 0,
  },
  {
    ...STANDARD_FETCH,
    id: "vivid-stage-llm",
    name: "Vivid Stage",
    type: "llm-extract",
    // Professional theater in residence at the Oakes Center, 120 Morris Ave,
    // Summit. ~2-3 mainstage productions + readings/cabarets/improv per season.
    url: "https://www.vividstage.org",
    publicUrl: "https://www.vividstage.org",
    town: "Summit",
    autoApprove: true,
    group: "nearby-venues",
    allowedHosts: ["vividstage.org", "www.vividstage.org"],
    expectedContentTypes: ["text/html", "application/xhtml+xml"],
    minimumExpectedEvents: 0,
  },
  {
    ...STANDARD_FETCH,
    id: "steeple-concerts-llm",
    name: "Steeple Concerts at St. Paul's",
    type: "llm-extract",
    // Classical series at St. Paul's, Westfield; ~6 concerts/season announced
    // on one season page. Squarespace robots.txt explicitly disallows
    // ?format=json and ?format=ical — extract from human-readable pages only.
    url: "https://www.steepleconcerts.org/home",
    publicUrl: "https://www.steepleconcerts.org/home",
    town: "Westfield",
    autoApprove: true,
    group: "nearby-venues",
    allowedHosts: ["steepleconcerts.org", "www.steepleconcerts.org"],
    expectedContentTypes: ["text/html", "application/xhtml+xml"],
    minimumExpectedEvents: 0,
  },
  {
    ...STANDARD_FETCH,
    id: "summit-film-society-llm",
    name: "Film Society of Summit",
    type: "llm-extract",
    // Nonprofit indie-film screenings at MONDO, Summit (est. 2012), often
    // with post-screening Q&As. ~1-2/month.
    url: "http://www.summitfilmsociety.com/",
    publicUrl: "http://www.summitfilmsociety.com/",
    town: "Summit",
    autoApprove: true,
    group: "nearby-venues",
    allowedHosts: ["summitfilmsociety.com", "www.summitfilmsociety.com"],
    expectedContentTypes: ["text/html", "application/xhtml+xml"],
    minimumExpectedEvents: 0,
  },
  {
    ...STANDARD_FETCH,
    id: "vacnj-llm",
    name: "Visual Arts Center of New Jersey",
    type: "llm-extract",
    // 68 Elm St, Summit. Exhibitions + artist talks + Studio School classes
    // (registration catalog at artcenternj.augusoft.net). Modest volume.
    url: "https://artcenternj.org",
    publicUrl: "https://artcenternj.org",
    town: "Summit",
    autoApprove: true,
    group: "nearby-venues",
    allowedHosts: ["artcenternj.org", "www.artcenternj.org"],
    expectedContentTypes: ["text/html", "application/xhtml+xml"],
    minimumExpectedEvents: 0,
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
  "Stage House Tavern": "Music",
  "Bull n Bear Brewery": "Music",
  "Wet Ticket Brewing": "Entertainment",
  "Felina Summit": "Food & Drink",
  "Deutscher Club of Clark": "Community",
  "Tomasello Winery Cranford": "Music",
  "The James Ward Mansion": "Community",
  "Fire Me Up Studio": "Arts & Culture",
  "Westfield Area YMCA": "Sports & Recreation",
  "Union County Cultural Events": "Arts & Culture",
  "Fanwood Memorial Library": "Community",
  "Great Awakening Brewing Company": "Music",
  "StreetFairs.org": "Community",
  "CDC Theatre": "Entertainment",
  "Westfield Community Players": "Entertainment",
  "Vivid Stage": "Entertainment",
  "Steeple Concerts at St. Paul's": "Music",
  "Film Society of Summit": "Entertainment",
  "Visual Arts Center of New Jersey": "Arts & Culture",
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
