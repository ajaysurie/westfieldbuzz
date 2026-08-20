/** Release One's hard freshness ceiling for public projections. */
export const MAX_PUBLIC_VERIFICATION_AGE_HOURS = 36;

export function isWithinVerificationAge(value: Date | string | null | undefined, now = new Date()): boolean {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime())
    && date.getTime() >= now.getTime() - MAX_PUBLIC_VERIFICATION_AGE_HOURS * 60 * 60 * 1000;
}
