import { NextResponse } from "next/server";
import { confirmSubscription } from "@/lib/server/email/subscribers";
import { verifyEmailToken } from "@/lib/server/email/tokens";
import { getAdminDb } from "@/lib/server/firebase-admin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = verifyEmailToken(
    url.searchParams.get("token") ?? "",
    process.env.EMAIL_TOKEN_SECRET ?? ""
  );
  let status = "invalid";
  if (token?.purpose === "confirm") {
    status = await confirmSubscription({
      db: getAdminDb(),
      subscriberId: token.subscriberId,
      tokenVersion: token.version,
    });
  }
  const destination = new URL("/subscribe/confirmed", url.origin);
  destination.searchParams.set("status", status);
  return NextResponse.redirect(destination);
}
