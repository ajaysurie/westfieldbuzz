import type { Metadata } from "next";
import { getPublicSourcesByGroup } from "@/lib/public-sources";

export const metadata: Metadata = {
  title: "Event Sources",
  description:
    "Where Westfield Buzz gets its events: local libraries, town calendars, venues, and arts organizations across Westfield and nearby towns.",
};

/**
 * The Instagram curator is not part of the feed registry (it pushes through
 * the agent ingest endpoint), so it is listed here as a static row.
 */
const INSTAGRAM_CURATOR = {
  id: "instagram-curator",
  name: "Westfield Buzz Instagram curator",
  url: "https://www.instagram.com/",
  town: "Westfield area",
  groupLabel: "Instagram & web discovery",
  kindLabel: "Instagram",
  blurb: "A weekly roundup of event announcements from local venue Instagram accounts.",
};

const headingStyle = {
  fontFamily: "var(--font-display)",
  fontWeight: 400,
  color: "var(--ink)",
} as const;

export default function SourcesPage() {
  const groups = getPublicSourcesByGroup().map((group) =>
    group.label === INSTAGRAM_CURATOR.groupLabel
      ? { ...group, sources: [...group.sources, INSTAGRAM_CURATOR] }
      : group,
  );

  return (
    <div className="mx-auto max-w-[700px] px-12 py-12 max-md:px-6">
      <h1
        className="mb-6"
        style={{ ...headingStyle, fontSize: "2.2rem" }}
      >
        Where our events come from
      </h1>
      <div className="flex flex-col gap-10 text-[0.92rem] leading-[1.75] text-ink-light">
        <p>
          Every event on Westfield Buzz traces back to a public source below:
          library calendars, town and school calendars, venue websites, and
          local arts organizations. We check them automatically, remove
          duplicates, and link each listing back to its original source so you
          can always verify the details.
        </p>

        {groups.map((group) => (
          <section key={group.label}>
            <h2 className="mb-4 text-[1.15rem]" style={headingStyle}>
              {group.label}
            </h2>
            <ul className="flex flex-col gap-3">
              {group.sources.map((source) => (
                <li
                  key={source.id}
                  className="flex items-baseline justify-between gap-4 border-b border-[var(--line)] pb-3"
                >
                  <div>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium"
                      style={{ color: "var(--accent)" }}
                    >
                      {source.name}
                    </a>
                    {"blurb" in source && source.blurb ? (
                      <p className="mt-1 text-[0.85rem]">{source.blurb}</p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-[0.8rem] text-ink-light">
                    {source.town} &middot; {source.kindLabel}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section>
          <h2 className="mb-2 text-[1.15rem]" style={headingStyle}>
            Know a source we&rsquo;re missing?
          </h2>
          <p>
            If a local venue, organization, or town calendar publishes events we
            should be watching, email{" "}
            <a
              href="mailto:ajay@ajaysurie.com"
              style={{ color: "var(--accent)" }}
            >
              ajay@ajaysurie.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
