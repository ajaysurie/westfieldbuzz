import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { EVENT_SOURCES } from "../source-registry";
import { loadResolvedSources, parseOverrides, resolvedSourcesForGroup } from "../source-overrides";

const realId = EVENT_SOURCES[0].id;

function db(doc: { exists: boolean; data?: () => unknown } | Error): Firestore {
  return {
    collection: () => ({
      doc: () => ({
        get: async () => { if (doc instanceof Error) throw doc; return doc; },
      }),
    }),
  } as unknown as Firestore;
}

describe("parseOverrides", () => {
  it("keeps only known sources and valid fields", () => {
    const { map, warnings } = parseOverrides({
      [realId]: { autoApprove: true, enabled: false, junkTitlePatterns: ["^closed$", 5] },
      "ghost-source": { autoApprove: true },
      [EVENT_SOURCES[1].id]: "nonsense",
    });
    expect(map[realId]).toEqual({ autoApprove: true, enabled: false, junkTitlePatterns: ["^closed$"] });
    expect(map["ghost-source"]).toBeUndefined();
    expect(warnings.join(" ")).toContain("ghost-source");
    expect(warnings.join(" ")).toContain(EVENT_SOURCES[1].id);
  });

  it("ignores non-object input with a warning", () => {
    expect(parseOverrides("nope").warnings).toHaveLength(1);
    expect(parseOverrides(undefined).warnings).toHaveLength(0);
  });
});

describe("loadResolvedSources", () => {
  it("returns code defaults when no override document exists", async () => {
    const { sources } = await loadResolvedSources(db({ exists: false }));
    expect(sources).toHaveLength(EVENT_SOURCES.length);
    expect(sources.every((source) => source.enabled)).toBe(true);
    const original = EVENT_SOURCES.find((source) => source.id === realId)!;
    expect(sources.find((source) => source.id === realId)!.autoApprove).toBe(original.autoApprove);
  });

  it("applies an autoApprove override without touching the URL", async () => {
    // A venue with autoApprove flipped on still crawls its code-defined URL;
    // trust is data, the target is not.
    const venue = EVENT_SOURCES.find((source) => !source.autoApprove)!;
    const { sources } = await loadResolvedSources(
      db({ exists: true, data: () => ({ overrides: { [venue.id]: { autoApprove: true } } }) })
    );
    const resolved = sources.find((source) => source.id === venue.id)!;
    expect(resolved.autoApprove).toBe(true);
    expect(resolved.url).toBe(venue.url);
    expect(resolved.allowedHosts).toEqual(venue.allowedHosts);
  });

  it("hides a disabled source from its group but not from the full list", async () => {
    const target = EVENT_SOURCES[0];
    const data = () => ({ overrides: { [target.id]: { enabled: false } } });
    const full = await loadResolvedSources(db({ exists: true, data }));
    expect(full.sources.find((source) => source.id === target.id)!.enabled).toBe(false);
    const group = await resolvedSourcesForGroup(db({ exists: true, data }), target.group);
    expect(group.sources.find((source) => source.id === target.id)).toBeUndefined();
  });

  it("falls back to defaults and warns when the store is unreadable", async () => {
    const { sources, warnings } = await loadResolvedSources(db(new Error("permission denied")));
    expect(sources).toHaveLength(EVENT_SOURCES.length);
    expect(warnings.join(" ")).toContain("code defaults");
  });
});
