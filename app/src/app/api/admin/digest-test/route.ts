import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getAdminAuth, getAdminDb } from "@/lib/server/firebase-admin";
import {
  activeSubscriberFromDocument,
  createFirestoreDigestRepository,
  emailProps,
} from "@/lib/server/email/delivery";
import { buildDigestEdition, selectDigestEvents } from "@/lib/server/email/digest";
import { sendFridayDigest } from "@/lib/server/email/sender";
import {
  issueEmailToken,
  normalizeEmail,
  subscriberIdForEmail,
} from "@/lib/server/email/tokens";

export const runtime = "nodejs";
export const maxDuration = 60;

const UNSUBSCRIBE_TOKEN_DAYS = 395;

function bearer(request: Request): string | null {
  return /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
}

async function operator(request: Request): Promise<{ uid: string; email: string } | null> {
  const token = bearer(request);
  if (!token) return null;
  try {
    const identity = await getAdminAuth().verifyIdToken(token, true);
    if (!identity.email_verified || !identity.email) return null;
    const admin = await getAdminDb().collection("config").doc("admin").get();
    const allowlist = admin.data()?.allowlist;
    return Array.isArray(allowlist) && allowlist.includes(identity.email)
      ? { uid: identity.uid, email: identity.email } : null;
  } catch { return null; }
}

/**
 * Sends the current edition to the signed-in admin's own address. Same
 * inventory, edition builder, event selection, and sender as the Friday cron
 * — the only differences are the single recipient and no delivery ledger, so
 * a test send can never double-mail subscribers.
 */
export async function POST(request: Request) {
  const actor = await operator(request);
  if (!actor) {
    return NextResponse.json({ ok: false, message: "Admin authorization required." }, { status: 403 });
  }
  const tokenSecret = process.env.EMAIL_TOKEN_SECRET ?? "";
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  if (!tokenSecret || !configuredOrigin) {
    return NextResponse.json({ ok: false, error: "Digest email is not configured" }, { status: 503 });
  }
  const siteOrigin = new URL(configuredOrigin).origin;
  const db = getAdminDb();
  const repository = createFirestoreDigestRepository(db);
  const now = new Date();
  const edition = buildDigestEdition({
    events: await repository.listInventory(now),
    now,
  });
  if (edition.status === "held") {
    return NextResponse.json({
      ok: false,
      editionId: edition.id,
      holdReason: edition.holdReason,
    });
  }

  const normalized = normalizeEmail(actor.email);
  if (!normalized) {
    return NextResponse.json({ ok: false, error: "Admin account has no usable email" }, { status: 400 });
  }
  const subscriberId = subscriberIdForEmail(normalized);
  const subscriberDoc = await db.collection("subscribers").doc(subscriberId).get();
  const subscriber = subscriberDoc.exists
    ? activeSubscriberFromDocument(subscriberDoc.id, subscriberDoc.data() ?? {})
    : null;
  const token = issueEmailToken({
    subscriberId,
    purpose: "unsubscribe",
    version: subscriber?.tokenVersion ?? 1,
    expiresAt: new Date(now.getTime() + UNSUBSCRIBE_TOKEN_DAYS * 86_400_000),
    secret: tokenSecret,
  });
  const unsubscribePageUrl = new URL("/unsubscribe", siteOrigin);
  unsubscribePageUrl.searchParams.set("token", token);
  const oneClickUnsubscribeUrl = new URL("/api/subscriptions/unsubscribe", siteOrigin);
  oneClickUnsubscribeUrl.searchParams.set("token", token);

  const selection = selectDigestEvents(edition, null, false);
  const props = emailProps({
    edition,
    eventIds: selection.eventIds,
    personalized: false,
    unsubscribePageUrl: unsubscribePageUrl.toString(),
    oneClickUnsubscribeUrl: oneClickUnsubscribeUrl.toString(),
    siteOrigin,
  });
  const testId = randomUUID();
  await sendFridayDigest({
    email: actor.email,
    props,
    deliveryKey: `test/${edition.id}/${subscriberId}/${testId}`,
    deliveryId: `test-${testId}`,
  });
  return NextResponse.json({
    ok: true,
    editionId: edition.id,
    issueLabel: edition.issueLabel,
    events: props.events.length,
  });
}
