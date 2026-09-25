import {
  EVENT_SOURCES,
  type SourceGroup,
} from "./server/ingestion/source-registry";

/**
 * Public-facing view of the ingestion source registry.
 *
 * Derived directly from EVENT_SOURCES so the /sources page always matches
 * what the pipeline actually reads. Internal plumbing sources (discovery
 * sweeps with no public page of their own) are hidden here.
 */

/** Sources that are internal plumbing, not publishers a reader would recognize. */
const HIDDEN_SOURCE_IDS = new Set(["westfield-llm-search"]);

export const SOURCE_GROUP_LABELS: Record<SourceGroup, string> = {
  "core-libraries": "Libraries",
  "core-town-school": "Town & school calendars",
  "nearby-venues": "Venues & arts",
  "venue-search": "Instagram & web discovery",
};

const KIND_LABELS: Record<string, string> = {
  libcal: "Library calendar",
  "civicplus-ical": "Town calendar",
  ical: "School calendar",
  "wordpress-mec-html": "Venue website",
  "wordpress-tribe-json": "Venue website",
  jsonld: "Venue website",
  "jsonld-index": "Venue website",
  "llm-extract": "Venue website",
  "llm-search": "Web listings",
  "eventbrite-organizer": "Eventbrite",
  "instagram-profile": "Instagram",
};

export interface PublicSource {
  id: string;
  name: string;
  url: string;
  town: string;
  group: SourceGroup;
  groupLabel: string;
  kindLabel: string;
}

export function getPublicSources(): PublicSource[] {
  return EVENT_SOURCES.filter((source) => !HIDDEN_SOURCE_IDS.has(source.id)).map(
    (source) => ({
      id: source.id,
      name: source.name,
      url: source.publicUrl ?? source.url,
      town: source.town,
      group: source.group,
      groupLabel: SOURCE_GROUP_LABELS[source.group],
      kindLabel: KIND_LABELS[source.type] ?? "Website",
    }),
  );
}

export interface PublicSourceGroup {
  label: string;
  sources: PublicSource[];
}

export function getPublicSourcesByGroup(): PublicSourceGroup[] {
  const groups: PublicSourceGroup[] = [];
  for (const source of getPublicSources()) {
    let group = groups.find((entry) => entry.label === source.groupLabel);
    if (!group) {
      group = { label: source.groupLabel, sources: [] };
      groups.push(group);
    }
    group.sources.push(source);
  }
  return groups;
}
