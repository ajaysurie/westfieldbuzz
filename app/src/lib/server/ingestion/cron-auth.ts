import { timingSafeEqual } from "node:crypto";

function equalSecrets(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export type CronAuthorization =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

export function authorizeCron(
  authorization: string | null,
  secret = process.env.CRON_SECRET
): CronAuthorization {
  if (!secret) {
    return { ok: false, status: 503, error: "CRON_SECRET is not configured" };
  }
  const expected = `Bearer ${secret}`;
  if (!authorization || !equalSecrets(authorization, expected)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

export function cronFeatureEnabled(feature: "ingest" | "discover" | "friday" | "watchdog"): boolean {
  const key = feature === "ingest"
    ? "WESTFIELDBUZZ_ENABLE_INGEST"
    : feature === "discover"
      ? "WESTFIELDBUZZ_ENABLE_DISCOVER"
      : feature === "friday"
        ? "WESTFIELDBUZZ_ENABLE_FRIDAY_DIGEST"
        : "WESTFIELDBUZZ_ENABLE_FRESHNESS_WATCHDOG";
  return process.env[key] === "true";
}
