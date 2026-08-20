import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/server/firebase-admin";
import { saveAndLinkPreferences } from "@/lib/server/account/preferences";
import {
  recordConfirmationAccepted,
  recordConfirmationAttempt,
  confirmationAttemptDetails,
  recordConfirmationFailed,
  requestSubscription,
} from "@/lib/server/email/subscribers";
import { issueEmailToken, normalizeEmail } from "@/lib/server/email/tokens";
import { enforceSignupRateLimit } from "@/lib/server/email/rate-limit";
import {
  EmailProviderTimeoutError,
  sendSubscriptionConfirmation,
} from "@/lib/server/email/sender";

const PUBLIC_RESPONSE = {
  ok: true,
  message: "Check your inbox to confirm Friday's list.",
};

function siteOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return new URL(configured).origin;
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Enter a valid email address." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, message: "Enter a valid email address." }, { status: 400 });
  }

  const email =
    "email" in body
      ? String(body.email)
      : "";
  if (email.length > 254) {
    return NextResponse.json({ ok: false, message: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) throw new Error("INVALID_EMAIL");
    const db = getAdminDb();
    const ip =
      request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const allowed = await enforceSignupRateLimit({
      db,
      normalizedEmail,
      ip,
      secret: process.env.EMAIL_TOKEN_SECRET ?? "",
    });
    if (!allowed) {
      return NextResponse.json(
        { ok: false, message: "Too many signup attempts. Please try again later." },
        { status: 429 }
      );
    }
    const result = await requestSubscription({
      db,
      email: normalizedEmail,
      source: "public-friday-signup",
    });

    // A subscription always follows the ordinary consent/confirmation path.
    // A valid matching sign-in can only link the existing record; it cannot
    // create, reactivate, or otherwise change subscriber status.
    const authorization = request.headers.get("authorization") ?? "";
    const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1];
    if (token) {
      try {
        const account = await getAdminAuth().verifyIdToken(token, true);
        if (account.email_verified && account.email && normalizeEmail(account.email) === normalizedEmail) {
          await saveAndLinkPreferences({
            db,
            account: { uid: account.uid, email: normalizedEmail },
          });
        }
      } catch {
        // Signup remains anonymous and consent-led if an optional token expires.
      }
    }

    if (result.confirmationRequired) {
      const secret = process.env.EMAIL_TOKEN_SECRET ?? "";
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const token = issueEmailToken({
        subscriberId: result.subscriber.id,
        purpose: "confirm",
        version: result.subscriber.tokenVersion,
        expiresAt,
        secret,
      });
      const confirmationUrl = new URL("/subscribe/confirm", siteOrigin(request));
      confirmationUrl.searchParams.set("token", token);
      const idempotencyKey = `confirm/${result.subscriber.id}/${result.subscriber.tokenVersion}`;
      const confirmationDeliveryId = await recordConfirmationAttempt({
        db,
        subscriber: result.subscriber,
        confirmationUrl: confirmationUrl.toString(),
        idempotencyKey,
        expiresAt,
      });
      const persistedAttempt = await confirmationAttemptDetails({ db, deliveryId: confirmationDeliveryId });
      if (!persistedAttempt) throw new Error("CONFIRMATION_ATTEMPT_MISSING");
      let providerEmailId: string;
      try {
        providerEmailId = await sendSubscriptionConfirmation({
          email: result.subscriber.email,
          confirmationUrl: persistedAttempt.confirmationUrl,
          idempotencyKey: persistedAttempt.idempotencyKey,
          confirmationDeliveryId,
        });
      } catch (error) {
        if (!(error instanceof EmailProviderTimeoutError)) {
          await recordConfirmationFailed({
            db,
            deliveryId: confirmationDeliveryId,
            subscriber: result.subscriber,
            error: error instanceof Error ? error.message : "Unknown confirmation delivery error",
          });
        }
        // A timeout is ambiguous, so its attempt/cooldown remains in place and
        // the immutable provider idempotency key is retained for recovery.
        return NextResponse.json(
          { ok: false, message: "We couldn't start your signup. Please try again." },
          { status: 503 }
        );
      }
      try {
        await recordConfirmationAccepted({
          db,
          deliveryId: confirmationDeliveryId,
          providerEmailId,
        });
      } catch {
        // Acceptance is known, but persistence was ambiguous. Preserve the
        // sending lease rather than treating the message as a definite failure.
        return NextResponse.json(
          { ok: false, message: "We couldn't start your signup. Please try again." },
          { status: 503 }
        );
      }
    }
    return NextResponse.json(PUBLIC_RESPONSE, { status: 202 });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_EMAIL") {
      return NextResponse.json({ ok: false, message: "Enter a valid email address." }, { status: 400 });
    }
    console.error("Subscription request failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json(
      { ok: false, message: "We couldn't start your signup. Please try again." },
      { status: 503 }
    );
  }
}
