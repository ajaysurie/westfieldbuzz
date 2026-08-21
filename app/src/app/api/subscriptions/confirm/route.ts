import { NextResponse } from "next/server";
import { confirmSubscription } from "@/lib/server/email/subscribers";
import { verifyEmailToken } from "@/lib/server/email/tokens";
import { getAdminDb } from "@/lib/server/firebase-admin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const destination = new URL("/subscribe/confirm", url.origin);
  destination.searchParams.set("token", url.searchParams.get("token") ?? "");
  return NextResponse.redirect(destination);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = verifyEmailToken(
      typeof body?.token === "string" ? body.token : "",
      process.env.EMAIL_TOKEN_SECRET ?? ""
    );
    if (!token || token.purpose !== "confirm") {
      return NextResponse.json({ ok: false, status: "invalid" }, { status: 400 });
    }
    const status = await confirmSubscription({
      db: getAdminDb(),
      subscriberId: token.subscriberId,
      tokenVersion: token.version,
    });
    return NextResponse.json({ ok: status !== "invalid", status }, { status: status === "invalid" ? 400 : 200 });
  } catch (error) {
    console.error("Subscription confirmation failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, status: "unavailable" }, { status: 503 });
  }
}
