import type { Metadata } from "next";
import { EVENT_CATEGORIES } from "@/lib/events/types";
import { FEEDBACK_REASONS } from "@/lib/feedback";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "For Agents",
  description:
    "How AI agents and developers can read Westfield Buzz events and report problems: public JSON API, calendar feed, OpenAPI spec, feedback endpoint, llms.txt, and schema.org Event JSON-LD.",
  alternates: { canonical: "/agents" },
};

const headingStyle = {
  fontFamily: "var(--font-display)",
  fontWeight: 400,
  color: "var(--ink)",
} as const;

const codeStyle = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

function ParamRow({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 border-b border-[var(--line)] py-2 max-md:grid-cols-1 max-md:gap-1">
      <code className="text-[0.85rem] font-semibold" style={{ ...codeStyle, color: "var(--ink)" }}>
        {name}
      </code>
      <p className="text-[0.88rem]">{children}</p>
    </div>
  );
}

export default function AgentsPage() {
  return (
    <div className="mx-auto max-w-[700px] px-12 py-12 max-md:px-6">
      <h1 className="mb-6" style={{ ...headingStyle, fontSize: "2.2rem" }}>
        For agents
      </h1>
      <div className="flex flex-col gap-10 text-[0.92rem] leading-[1.75] text-ink-light">
        <p>
          Building an agent that needs to know what&rsquo;s happening around
          Westfield, New Jersey? Everything below is public, needs no API key,
          and is free to use with attribution. Link back to the event page or
          its source so people can verify details.
        </p>

        <section>
          <h2 className="mb-3 text-[1.15rem]" style={headingStyle}>
            Events API
          </h2>
          <p className="mb-3">
            <code
              className="rounded bg-black/5 px-2 py-1 text-[0.85rem]"
              style={codeStyle}
            >
              GET https://www.westfieldbuzz.com/api/events
            </code>
          </p>
          <p className="mb-4">
            Returns upcoming published events as JSON, soonest first. The{" "}
            <a href="/openapi.json" style={{ color: "var(--accent)" }}>
              <code style={codeStyle}>OpenAPI spec</code>
            </a>{" "}
            describes every field. Example:{" "}
            <a
              href="/api/events?town=Westfield&category=Music&limit=20"
              style={{ color: "var(--accent)" }}
            >
              <code className="text-[0.85rem]" style={codeStyle}>
                /api/events?town=Westfield&amp;category=Music&amp;limit=20
              </code>
            </a>
          </p>
          <div className="mb-4">
            <ParamRow name="town">
              Filter by town, case-insensitive. Examples:{" "}
              <code style={codeStyle}>Westfield</code>,{" "}
              <code style={codeStyle}>Summit</code>,{" "}
              <code style={codeStyle}>Cranford</code>.
            </ParamRow>
            <ParamRow name="category">
              One of: {EVENT_CATEGORIES.join(", ")}.
            </ParamRow>
            <ParamRow name="from / to">
              Dates as <code style={codeStyle}>YYYY-MM-DD</code>, interpreted
              as America/New_York calendar days. Defaults to today through the
              next 90 days; a window can span at most 92 days.
            </ParamRow>
            <ParamRow name="limit">
              Integer from 1 to 200. Default 50.
            </ParamRow>
          </div>
          <p className="mb-2">Each event includes:</p>
          <ul className="ml-5 list-disc flex flex-col gap-1 text-[0.88rem]">
            <li>
              <code style={codeStyle}>id</code>,{" "}
              <code style={codeStyle}>url</code> (the canonical event page),{" "}
              <code style={codeStyle}>title</code>,{" "}
              <code style={codeStyle}>description</code>
            </li>
            <li>
              <code style={codeStyle}>startDate</code> /{" "}
              <code style={codeStyle}>endDate</code> (ISO 8601,{" "}
              <code style={codeStyle}>endDate</code> may be null)
            </li>
            <li>
              <code style={codeStyle}>location</code>,{" "}
              <code style={codeStyle}>town</code>,{" "}
              <code style={codeStyle}>category</code>
            </li>
            <li>
              <code style={codeStyle}>status</code> (scheduled, rescheduled,
              weather-dependent, postponed, cancelled) and{" "}
              <code style={codeStyle}>availability</code> (available,
              registration-required, waitlist, sold-out; omitted when the
              source does not say)
            </li>
            <li>
              <code style={codeStyle}>isFree</code>,{" "}
              <code style={codeStyle}>costAmount</code> (USD),{" "}
              <code style={codeStyle}>minAge</code> /{" "}
              <code style={codeStyle}>maxAge</code>,{" "}
              <code style={codeStyle}>registration</code> (required, drop-in),{" "}
              <code style={codeStyle}>environment</code> (indoor, outdoor)
              &mdash; each <code style={codeStyle}>null</code> when the source
              did not list it
            </li>
            <li>
              <code style={codeStyle}>sourceUrl</code> (the original listing &mdash;
              authoritative for details),{" "}
              <code style={codeStyle}>imageUrl</code> (when available),{" "}
              <code style={codeStyle}>lastVerifiedAt</code>
            </li>
          </ul>
          <p className="mt-3">
            Responses are cached at the edge for an hour. Bad parameters return{" "}
            <code style={codeStyle}>400</code> with a message naming the valid
            values.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-[1.15rem]" style={headingStyle}>
            Report a problem or a missing event
          </h2>
          <p className="mb-3">
            <code
              className="rounded bg-black/5 px-2 py-1 text-[0.85rem]"
              style={codeStyle}
            >
              POST https://www.westfieldbuzz.com/api/feedback
            </code>
          </p>
          <p className="mb-3">
            If a listing looks wrong, send a JSON body with{" "}
            <code style={codeStyle}>eventId</code> (from the API) and a{" "}
            <code style={codeStyle}>reason</code>:{" "}
            {Object.keys(FEEDBACK_REASONS).map((reason, index, all) => (
              <span key={reason}>
                <code style={codeStyle}>{reason}</code>
                {index < all.length - 1 ? ", " : ""}
              </span>
            ))}
            . Add a <code style={codeStyle}>message</code> with what you found.
            To suggest an event we don&rsquo;t list, send{" "}
            <code style={codeStyle}>reason: &quot;missing-event&quot;</code> with
            the details in <code style={codeStyle}>message</code>.
          </p>
          <pre
            className="overflow-x-auto rounded bg-black/5 p-3 text-[0.8rem] leading-[1.5]"
            style={codeStyle}
          >
{String.raw`curl -X POST https://www.westfieldbuzz.com/api/feedback \
  -H 'Content-Type: application/json' \
  -d '{"eventId":"<id>","reason":"cancelled","message":"Source page says cancelled"}'`}
          </pre>
          <p className="mt-3">
            Returns <code style={codeStyle}>202</code> when received. A person
            reads every report. Reports are rate limited per address.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-[1.15rem]" style={headingStyle}>
            Other machine-readable surfaces
          </h2>
          <ul className="ml-5 list-disc flex flex-col gap-2">
            <li>
              <a href="/calendar.ics" style={{ color: "var(--accent)" }}>
                <code style={codeStyle}>/calendar.ics</code>
              </a>{" "}
              &mdash; a subscribable iCalendar feed. Takes the same{" "}
              <code style={codeStyle}>town</code>,{" "}
              <code style={codeStyle}>category</code>,{" "}
              <code style={codeStyle}>from</code>/<code style={codeStyle}>to</code>, and{" "}
              <code style={codeStyle}>limit</code> params as the API.
            </li>
            <li>
              <a href="/openapi.json" style={{ color: "var(--accent)" }}>
                <code style={codeStyle}>/openapi.json</code>
              </a>{" "}
              &mdash; OpenAPI 3.1 description of the API, feed, and feedback endpoint.
            </li>
            <li>
              <a href="/llms.txt" style={{ color: "var(--accent)" }}>
                <code style={codeStyle}>/llms.txt</code>
              </a>{" "}
              &mdash; a short summary of what the site covers and how to read it.
            </li>
            <li>
              <a href="/sitemap.xml" style={{ color: "var(--accent)" }}>
                <code style={codeStyle}>/sitemap.xml</code>
              </a>{" "}
              &mdash; includes every published event URL for crawling.
            </li>
            <li>
              Every event page (<code style={codeStyle}>/events/[id]</code>)
              carries schema.org Event JSON-LD with name, startDate, endDate,
              location, eventStatus, and, when listed, offers, isAccessibleForFree,
              and typicalAgeRange.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-[1.15rem]" style={headingStyle}>
            Data notes
          </h2>
          <ul className="ml-5 list-disc flex flex-col gap-2">
            <li>All times are America/New_York.</li>
            <li>
              Listings refresh automatically from{" "}
              <a href="/sources" style={{ color: "var(--accent)" }}>
                public local sources
              </a>
              ; details can change, so the source is authoritative.
            </li>
            <li>
              Coverage is Westfield-first; nearby-town coverage depends on what
              local sources publish.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-[1.15rem]" style={headingStyle}>
            Contact
          </h2>
          <p>
            Questions about the data? Email{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              style={{ color: "var(--accent)" }}
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
