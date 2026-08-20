import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/server/firebase-admin";
import { requestSubscription } from "@/lib/server/email/subscribers";
import { issueEmailToken } from "@/lib/server/email/tokens";
import { sendSubscriptionConfirmation } from "@/lib/server/email/sender";

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

  const email =
    body && typeof body === "object" && "email" in body
      ? String(body.email)
      : "";
  if (email.length > 254) {
    return NextResponse.json({ ok: false, message: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const result = await requestSubscription({
      db: getAdminDb(),
      email,
      source: "public-friday-signup",
    });

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
      const confirmationUrl = new URL("/api/subscriptions/confirm", siteOrigin(request));
      confirmationUrl.searchParams.set("token", token);
      await sendSubscriptionConfirmation({
        email: result.subscriber.email,
        confirmationUrl: confirmationUrl.toString(),
        idempotencyKey: `confirm/${result.subscriber.id}/${result.subscriber.tokenVersion}`,
      });
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
