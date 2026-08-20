import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/server/firebase-admin";
import {
  createFirestoreDigestRepository,
  runFridayDigest,
} from "@/lib/server/email/delivery";
import { authorizeCron, cronFeatureEnabled } from "@/lib/server/ingestion/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authorization = authorizeCron(request.headers.get("authorization"));
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  }
  if (!cronFeatureEnabled("friday")) {
    return NextResponse.json({ ok: false, error: "Friday digest is disabled" }, { status: 503 });
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
    const now = new Date();
    const url = new URL(request.url);
    const summary = await runFridayDigest({
      repository: createFirestoreDigestRepository(getAdminDb()),
      siteOrigin: new URL(configuredOrigin).origin,
      tokenSecret,
      cursor: url.searchParams.get("cursor"),
      deadlineAt: new Date(now.getTime() + 50_000),
    });
    return NextResponse.json({ ok: summary.status === "success", ...summary }, {
      status: summary.status === "success" ? 200 : summary.status === "partial" ? 207 : 503,
    });
  } catch (error) {
    console.error("Friday digest job failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, error: "Friday digest job failed" }, { status: 503 });
  }
}
