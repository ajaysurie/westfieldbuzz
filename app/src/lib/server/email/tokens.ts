import {
  createHmac,
  createHash,
  timingSafeEqual,
} from "node:crypto";

export type EmailTokenPurpose = "confirm" | "unsubscribe";

export interface VerifiedEmailToken {
  subscriberId: string;
  purpose: EmailTokenPurpose;
  version: number;
  expiresAt: Date;
}

const TOKEN_VERSION = "v1";

export function normalizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return normalized;
}

export function subscriberIdForEmail(normalizedEmail: string): string {
  return createHash("sha256").update(normalizedEmail).digest("hex");
}

function signature(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function issueEmailToken(input: {
  subscriberId: string;
  purpose: EmailTokenPurpose;
  version: number;
  expiresAt: Date;
  secret: string;
}): string {
  if (!input.secret) throw new Error("EMAIL_TOKEN_SECRET is required");
  const body = [
    TOKEN_VERSION,
    input.purpose,
    input.version,
    Math.floor(input.expiresAt.getTime() / 1000),
    input.subscriberId,
  ].join(".");
  return `${body}.${signature(body, input.secret)}`;
}

export function verifyEmailToken(
  token: string,
  secret: string,
  now = new Date()
): VerifiedEmailToken | null {
  if (!secret || token.length > 512) return null;
  const parts = token.split(".");
  if (parts.length !== 6 || parts[0] !== TOKEN_VERSION) return null;

  const [format, purpose, versionRaw, expiresRaw, subscriberId, supplied] = parts;
  if (purpose !== "confirm" && purpose !== "unsubscribe") return null;
  if (!/^[a-f0-9]{64}$/.test(subscriberId)) return null;

  const version = Number(versionRaw);
  const expiresSeconds = Number(expiresRaw);
  if (!Number.isSafeInteger(version) || version < 1) return null;
  if (!Number.isSafeInteger(expiresSeconds)) return null;

  const body = [format, purpose, versionRaw, expiresRaw, subscriberId].join(".");
  const expected = signature(body, secret);
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (
    expectedBytes.length !== suppliedBytes.length ||
    !timingSafeEqual(expectedBytes, suppliedBytes)
  ) {
    return null;
  }

  const expiresAt = new Date(expiresSeconds * 1000);
  if (expiresAt.getTime() <= now.getTime()) return null;
  return { subscriberId, purpose, version, expiresAt };
}
