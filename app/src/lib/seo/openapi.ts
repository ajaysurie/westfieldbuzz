import { EVENT_CATEGORIES } from "@/lib/events/types";
import { FEEDBACK_CONTACT_MAX, FEEDBACK_MESSAGE_MAX, FEEDBACK_REASONS } from "@/lib/feedback";
import { SITE_ORIGIN } from "@/lib/site";

const filterParams = [
  { name: "town", in: "query", schema: { type: "string" }, description: "Town name, case-insensitive (e.g. Westfield, Summit, Cranford)." },
  { name: "category", in: "query", schema: { type: "string", enum: [...EVENT_CATEGORIES] }, description: "Case-insensitive." },
  { name: "from", in: "query", schema: { type: "string", format: "date" }, description: "First America/New_York day, YYYY-MM-DD. Defaults to today." },
  { name: "to", in: "query", schema: { type: "string", format: "date" }, description: "Last America/New_York day, YYYY-MM-DD. Defaults to the coming weeks." },
];

const nullableNumber = { type: ["number", "null"] };

/** OpenAPI 3.1 description of the public, keyless endpoints. */
export function buildOpenApi() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Westfield Buzz",
      version: "1",
      description: "Public events around Westfield, NJ, and a way to report listing problems. No key required. Times are America/New_York.",
    },
    servers: [{ url: SITE_ORIGIN }],
    paths: {
      "/api/events": {
        get: {
          operationId: "listEvents",
          summary: "Upcoming published events, soonest first",
          parameters: [
            ...filterParams,
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
          ],
          responses: {
            "200": {
              description: "Events",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["events", "count", "generatedAt"],
                    properties: {
                      events: { type: "array", items: { $ref: "#/components/schemas/Event" } },
                      count: { type: "integer" },
                      generatedAt: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
            "400": { description: "Invalid parameter; the message names valid values." },
            "503": { description: "Event store temporarily unavailable." },
          },
        },
      },
      "/calendar.ics": {
        get: {
          operationId: "calendarFeed",
          summary: "Subscribable iCalendar feed with the same filters as /api/events",
          parameters: [
            ...filterParams,
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 200 } },
          ],
          responses: { "200": { description: "iCalendar feed", content: { "text/calendar": { schema: { type: "string" } } } } },
        },
      },
      "/api/feedback": {
        post: {
          operationId: "sendFeedback",
          summary: "Report a problem with a listing, or suggest a missing event",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["reason"],
                  properties: {
                    reason: {
                      type: "string",
                      enum: Object.keys(FEEDBACK_REASONS),
                      description: "missing-event and other need a message; the rest need an eventId.",
                    },
                    eventId: { type: "string", description: "An id from /api/events." },
                    message: { type: "string", maxLength: FEEDBACK_MESSAGE_MAX },
                    contact: { type: "string", maxLength: FEEDBACK_CONTACT_MAX, description: "Optional reply address." },
                  },
                },
              },
            },
          },
          responses: {
            "202": { description: "Received" },
            "400": { description: "Invalid body; the message says why." },
            "404": { description: "Unknown eventId." },
            "429": { description: "Rate limited; retry in a minute." },
          },
        },
      },
    },
    components: {
      schemas: {
        Event: {
          type: "object",
          required: ["id", "url", "title", "description", "startDate", "endDate", "location", "town", "category", "status", "sourceUrl", "lastVerifiedAt"],
          properties: {
            id: { type: "string" },
            url: { type: "string", format: "uri", description: "Canonical event page." },
            title: { type: "string" },
            description: { type: "string" },
            startDate: { type: "string", format: "date-time" },
            endDate: { type: ["string", "null"], format: "date-time" },
            location: { type: "string" },
            town: { type: "string" },
            category: { type: "string", enum: [...EVENT_CATEGORIES] },
            status: { type: "string", enum: ["scheduled", "rescheduled", "weather-dependent", "postponed", "cancelled"] },
            availability: { type: "string", enum: ["available", "registration-required", "waitlist", "sold-out"], description: "Omitted when the source does not say." },
            isFree: { type: ["boolean", "null"] },
            costAmount: { ...nullableNumber, description: "US dollars." },
            minAge: nullableNumber,
            maxAge: nullableNumber,
            registration: { type: ["string", "null"], enum: ["required", "drop-in", null] },
            environment: { type: ["string", "null"], enum: ["indoor", "outdoor", null] },
            sourceUrl: { type: "string", description: "Original listing; authoritative for details." },
            imageUrl: { type: "string", format: "uri" },
            lastVerifiedAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
  };
}
