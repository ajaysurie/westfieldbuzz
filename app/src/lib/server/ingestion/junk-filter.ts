/**
 * Shared "not a real event" title filter.
 *
 * Per-source junkTitlePatterns handle a source's own quirks (a library's "room
 * reservation"). This is the cross-source layer: municipal and school iCal feeds
 * publish administrative entries as events, so board meetings, staff in-service
 * days, and office-closed notices land on a community calendar next to
 * FestiFall. A resident wants things to attend, not the town's internal
 * calendar.
 *
 * The list is a default in code and overridable through config/community, so it
 * can be tuned without a deploy. Each entry is a case-insensitive regular
 * expression tested against the event title.
 */
export const DEFAULT_JUNK_TITLE_PATTERNS: string[] = [
  // Governance and administration
  "\\bboard meeting\\b",
  "\\bboard of (education|health|adjustment)\\b",
  "\\b(planning|zoning) board\\b",
  "\\btownship (council|committee)\\b",
  "\\bcouncil (meeting|work ?session)\\b",
  "\\bcommission meeting\\b",
  "\\bpublic (meeting|hearing)\\b",
  "\\bwork ?session\\b",
  "\\bcaucus\\b",
  "\\bagenda (meeting|session)\\b",
  // School operations
  "\\bstaff (in-?services?|development)\\b",
  "\\bin-?service(s)?\\b",
  "\\bprofessional development\\b",
  "\\bearly dismissal\\b",
  "\\b(half|full) day\\b",
  "\\bmarking period\\b",
  "\\breport cards?\\b",
  "\\bparent[- ]teacher conferences?\\b",
  "\\bfaculty meeting\\b",
  "\\bteachers?\\b.*\\breturn\\b",
  // Closures and observances (not events you attend)
  "\\b(offices?|schools?|district|library) closed\\b",
  "\\bclosed\\b.*\\b(holiday|observ)",
  "\\bno school\\b",
  "\\brecess\\b",
  // Routine municipal services
  "\\b(recycling|garbage|trash|bulk|leaf|brush) (pickup|collection|drop)\\b",
  "\\bzone \\d+\\b",
  "\\bstreet sweeping\\b",
  // Holidays and observances published by school/municipal calendars. Anchored to
  // the WHOLE title so a real event that merely mentions the holiday survives:
  // "Rosh Hashanah" is filtered, "Hanukkah Menorah Lighting" and "Easter Egg
  // Hunt" are not. The optional trailing clause absorbs "(begins sundown)" etc.
  "^(labor day|columbus day|veterans day|election day|memorial day|presidents'? day|independence day|indigenous people'?s'? day|juneteenth|flag day|patriot day|mlk day|martin luther king,? jr\\.? day)( ?\\((observed|begins[^)]*)\\))?$",
  "^(thanksgiving( day)?|christmas( day| eve)?|new year'?s?( day| eve)?)( ?\\((observed|begins[^)]*)\\))?$",
  "^(rosh hashanah|yom kippur|sukkot|shavuot|passover|hanukkah|chanukah|diwali|eid[^)]*|ramadan|kwanzaa|lunar new year|good friday|ash wednesday|orthodox easter)( ?\\((observed|begins[^)]*|at sundown[^)]*)\\))?$",
  // School operations (not events a family attends)
  "^first day (for|of) (students|school)",
  "^last day (for|of) (students|school)",
  "\\bspring break\\b",
  "\\bwinter (recess|break)\\b",
  "\\bsummer (recess|break)\\b",
];

export interface JunkFilterConfig {
  patterns: string[];
  warnings: string[];
}

export function junkPatternsFromConfig(value: unknown): JunkFilterConfig {
  if (value === undefined) return { patterns: DEFAULT_JUNK_TITLE_PATTERNS, warnings: [] };
  if (!Array.isArray(value)) {
    return { patterns: DEFAULT_JUNK_TITLE_PATTERNS, warnings: ["Ignored malformed junkTitlePatterns"] };
  }
  const patterns: string[] = [];
  const warnings: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") { warnings.push("Ignored non-string junk pattern"); continue; }
    try {
      new RegExp(entry, "i");
      patterns.push(entry);
    } catch {
      warnings.push(`Ignored invalid junk pattern: ${entry.slice(0, 40)}`);
    }
  }
  // An explicit empty array means "no shared filtering", which is a valid choice.
  return { patterns, warnings };
}

/** Compile once; a bad pattern is skipped rather than throwing mid-run. */
export function compileJunkMatchers(patterns: string[]): RegExp[] {
  const compiled: RegExp[] = [];
  for (const pattern of patterns) {
    try { compiled.push(new RegExp(pattern, "i")); } catch { /* skip */ }
  }
  return compiled;
}

export function matchesJunk(title: string, matchers: RegExp[]): boolean {
  const trimmed = title.trim();
  if (!trimmed) return true;
  return matchers.some((matcher) => matcher.test(trimmed));
}
