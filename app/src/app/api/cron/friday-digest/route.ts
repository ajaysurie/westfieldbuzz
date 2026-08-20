import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/server/firebase-admin";
import {
  createFirestoreDigestRepository,
  runFridayDigest,
} from "@/lib/server/email/delivery";
import { hasValidCronAuthorization } from "./auth";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET ?? "";
  if (!hasValidCronAuthorization(request, cronSecret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const tokenSecret = process.env.EMAIL_TOKEN_SECRET ?? "";
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  if (!tokenSecret || !configuredOrigin) {
    return NextResponse.json(
      { ok: false, error: "Friday digest is not configured" },
      { status: 503 }
    );
  }

  try {
    const summary = await runFridayDigest({
      repository: createFirestoreDigestRepository(getAdminDb()),
      siteOrigin: new URL(configuredOrigin).origin,
      tokenSecret,
    });
    return NextResponse.json({ ok: summary.failed === 0, ...summary }, {
      status: summary.failed === 0 ? 200 : 503,
    });
  } catch (error) {
    console.error("Friday digest job failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, error: "Friday digest job failed" }, { status: 503 });
  }
}
