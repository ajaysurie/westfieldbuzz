import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/server/ingestion/cron-auth";
import { runDiscovery } from "@/lib/server/ingestion/discovery";
import { serverFirestore } from "@/lib/server/ingestion/firebase-admin";
import { acquireLease, releaseLease } from "@/lib/server/ingestion/lease";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authorization = authorizeCron(request.headers.get("authorization"));
  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.error },
      { status: authorization.status }
    );
  }
  const db = serverFirestore();
  const runId = randomUUID();
  const leaseKey = "event-source-discovery";
  const claim = await acquireLease({ db, key: leaseKey, owner: runId });
  if (!claim.acquired) {
    return NextResponse.json({ status: "skipped", reason: "lease-active" });
  }

  try {
    const result = await runDiscovery({ db, write: true, runId });
    return NextResponse.json({
      runId: result.runId,
      status: result.status,
      candidateCount: result.candidates.length,
      reachable: result.candidates.filter((candidate) => candidate.reachable).length,
      enabledSourcesAdded: 0,
    }, { status: result.status === "failed" ? 500 : result.status === "partial" ? 207 : 200 });
  } finally {
    await releaseLease({ db, key: leaseKey, owner: runId });
  }
}
