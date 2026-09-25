import { describe, expect, it } from "vitest";
import {
  SOURCE_GROUP_LABELS,
  getPublicSources,
  getPublicSourcesByGroup,
} from "../public-sources";
import {
  EVENT_SOURCES,
  SOURCE_GROUPS,
} from "../server/ingestion/source-registry";

describe("getPublicSources", () => {
  it("mirrors the ingestion registry minus internal plumbing", () => {
    const sources = getPublicSources();
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.length).toBeLessThanOrEqual(EVENT_SOURCES.length);
    // The internal web-search discovery source has no public page of its own.
    expect(sources.find((s) => s.id === "westfield-llm-search")).toBeUndefined();
  });

  it("gives every source a name, a public URL, and a town", () => {
    for (const source of getPublicSources()) {
      expect(source.name.trim().length).toBeGreaterThan(0);
      expect(source.url).toMatch(/^https?:\/\//);
      expect(source.town.trim().length).toBeGreaterThan(0);
      expect(source.groupLabel.trim().length).toBeGreaterThan(0);
      expect(source.kindLabel.trim().length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate source ids", () => {
    const ids = getPublicSources().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("labels every registry group", () => {
    for (const group of SOURCE_GROUPS) {
      expect(SOURCE_GROUP_LABELS[group]).toBeTruthy();
    }
  });
});

describe("getPublicSourcesByGroup", () => {
  it("partitions every public source into exactly one labeled group", () => {
    const groups = getPublicSourcesByGroup();
    const grouped = groups.flatMap((g) => g.sources);
    expect(grouped.length).toBe(getPublicSources().length);
    for (const group of groups) {
      expect(group.label.trim().length).toBeGreaterThan(0);
      expect(group.sources.length).toBeGreaterThan(0);
      for (const source of group.sources) {
        expect(source.groupLabel).toBe(group.label);
      }
    }
  });
});
