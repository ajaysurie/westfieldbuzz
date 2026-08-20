import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/server/ingestion/cron-auth";
import { serverFirestore } from "@/lib/server/ingestion/firebase-admin";
import { acquireLease, releaseLease } from "@/lib/server/ingestion/lease";
import {
  isSourceGroup,
  sourcesForGroup,
} from "@/lib/server/ingestion/source-registry";
import {
  makeIngestionWindow,
  runIngestion,
} from "@/lib/server/ingestion/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function localDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function GET(request: NextRequest) {
  const authorization = authorizeCron(request.headers.get("authorization"));
  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.error },
      { status: authorization.status }
    );
  }
  const group = request.nextUrl.searchParams.get("group") ?? "";
  if (!isSourceGroup(group)) {
    return NextResponse.json({ error: "A valid source group is required" }, { status: 400 });
  }

  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 30);
  const db = serverFirestore();
  const runId = randomUUID();
  const leaseKey = `event-ingest:${group}`;
  const claim = await acquireLease({ db, key: leaseKey, owner: runId });
  if (!claim.acquired) {
    return NextResponse.json({ status: "skipped", reason: "lease-active", group });
  }

  try {
    const result = await runIngestion({
      db,
      sources: sourcesForGroup(group),
      window: makeIngestionWindow({
        fromLocalDate: localDate(now),
        toLocalDate: localDate(end),
      }),
      write: true,
      runId,
      checkedAt: now,
    });
    return NextResponse.json(result, {
      status: result.status === "failed" ? 500 : result.status === "partial" ? 207 : 200,
    });
  } finally {
    await releaseLease({ db, key: leaseKey, owner: runId });
  }
}
