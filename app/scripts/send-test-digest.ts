/**
 * Sends this week's real Friday digest to one address, bypassing the
 * subscriber pipeline. Reads prod events through the client SDK (events are
 * public-read by Firestore rules), builds the edition with the same
 * buildDigestEdition + selectDigestEvents + emailProps as the cron, and
 * sends through Resend.
 *
 *   RESEND_API_KEY=... npx tsx scripts/send-test-digest.ts --to you@example.com --prod
 */
import "./load-test-env";
import { createElement } from "react";
import { render } from "@react-email/render";
import { Resend } from "resend";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "../src/lib/firebase";
import { buildDigestEdition, selectDigestEvents } from "../src/lib/server/email/digest";
import { emailProps } from "../src/lib/server/email/delivery";
import { normalizeCategory } from "../src/lib/events/normalize";
import { FridayDigest, fridayDigestText } from "../src/emails/FridayDigest";
import type { DigestEventSnapshot } from "../src/lib/server/email/digest";

const args = process.argv.slice(2);
const to = args[args.indexOf("--to") + 1];
if (!to || !to.includes("@")) {
  console.error("Usage: RESEND_API_KEY=... npx tsx scripts/send-test-digest.ts --to you@example.com --prod");
  process.exit(2);
}
if (!args.includes("--prod")) {
  console.error("Pass --prod to read the production event inventory.");
  process.exit(2);
}
const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error("RESEND_API_KEY is required.");
  process.exit(2);
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function snapshot(id: string, data: Record<string, unknown>): DigestEventSnapshot | null {
  const date = toDate(data.date);
  const lastVerifiedAt = toDate(data.lastVerifiedAt) ?? new Date(0);
  if (!date || typeof data.title !== "string" || typeof data.sourceUrl !== "string") return null;
  const cost = data.cost && typeof data.cost === "object" ? data.cost as Record<string, unknown> : null;
  const ageRange = data.ageRange && typeof data.ageRange === "object" ? data.ageRange as Record<string, unknown> : null;
  const costAmount = finite(data.costAmount) ?? finite(cost?.amount);
  return {
    id,
    title: data.title,
    date: date.toISOString(),
    endDate: toDate(data.endDate)?.toISOString() ?? null,
    location: typeof data.location === "string" ? data.location : "",
    town: typeof data.town === "string" ? data.town : "Westfield",
    category: normalizeCategory(typeof data.category === "string" ? data.category : undefined),
    status: data.status === "cancelled" || data.status === "postponed"
      || data.status === "rescheduled" || data.status === "weather-dependent"
      ? data.status : "scheduled",
    availability: data.availability === "available" || data.availability === "registration-required"
      || data.availability === "waitlist" || data.availability === "sold-out"
      ? data.availability : "unknown",
    sourceUrl: data.sourceUrl,
    publicationStatus: "published",
    freshnessStatus: data.freshnessStatus === "missing" || data.freshnessStatus === "stale"
      ? data.freshnessStatus : "current",
    lastVerifiedAt: lastVerifiedAt.toISOString(),
    minAge: finite(data.minAge) ?? finite(ageRange?.min),
    maxAge: finite(data.maxAge) ?? finite(ageRange?.max),
    costAmount,
    isFree: typeof data.isFree === "boolean" ? data.isFree
      : cost?.type === "free" ? true
      : costAmount == null ? null : costAmount === 0,
    environment: data.environment === "indoor" || data.environment === "outdoor" ? data.environment : null,
    driveMinutes: finite(data.driveMinutes),
  };
}

async function main() {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
  const snapshotResult = await getDocs(query(
    collection(db, "events"),
    where("publicationStatus", "==", "published"),
    where("date", ">=", Timestamp.fromDate(now)),
    where("date", "<=", Timestamp.fromDate(windowEnd)),
    orderBy("date", "asc"),
    limit(250)
  ));
  const events = snapshotResult.docs
    .map((doc) => snapshot(doc.id, doc.data()))
    .filter((event): event is DigestEventSnapshot => event !== null);
  console.log(`inventory: ${events.length} upcoming published events`);

  const edition = buildDigestEdition({ events, now });
  if (edition.status === "held") {
    console.log(`edition held: ${edition.holdReason} (${edition.id})`);
    return;
  }
  const selection = selectDigestEvents(edition, null, false);
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || "https://westfieldbuzz.com";
  const props = emailProps({
    edition,
    eventIds: selection.eventIds,
    personalized: false,
    unsubscribePageUrl: `${siteOrigin}/unsubscribe`,
    oneClickUnsubscribeUrl: `${siteOrigin}/api/subscriptions/unsubscribe`,
    siteOrigin,
  });

  const resend = new Resend(apiKey);
  const html = await render(createElement(FridayDigest, props));
  const response = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Westfield Buzz <hello@westfieldbuzz.com>",
    to,
    subject: `[test] ${props.issueLabel}: Your Westfield Buzz Friday list`,
    html,
    text: fridayDigestText(props),
  });
  if (response.error) {
    console.error("send failed:", response.error.message);
    process.exit(1);
  }
  console.log(`sent ${edition.id} (${props.events.length} events, "${props.issueLabel}") to ${to} — resend id ${response.data?.id}`);
  for (const event of props.events) console.log(`  - ${event.when} | ${event.title} (${event.town})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
