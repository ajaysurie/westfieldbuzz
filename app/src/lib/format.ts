/**
 * Format a full name to "First L." for privacy.
 * "Alice Smith" → "Alice S."
 * "Bob" → "Bob"
 * null/undefined → "A neighbor"
 */
export function formatReviewerName(name: string | null | undefined): string {
  if (!name) return "A neighbor";
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}
