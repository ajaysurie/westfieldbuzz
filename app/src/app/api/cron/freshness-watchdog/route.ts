import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/server/firebase-admin";
import { authorizeCron, cronFeatureEnabled } from "@/lib/server/ingestion/cron-auth";
import { runFreshnessWatchdog } from "@/lib/server/ingestion/freshness-watchdog";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authorization = authorizeCron(request.headers.get("authorization"));
  if (!authorization.ok) return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  if (!cronFeatureEnabled("watchdog")) return NextResponse.json({ ok: false, error: "Freshness watchdog is disabled" }, { status: 503 });
  try {
    const summary = await runFreshnessWatchdog({ db: getAdminDb() });
    return NextResponse.json({ ok: summary.status === "success", ...summary }, { status: summary.status === "success" ? 200 : 207 });
  } catch {
    return NextResponse.json({ ok: false, error: "Freshness watchdog failed" }, { status: 503 });
  }
}
