import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authorizeCron, cronFeatureEnabled } from "@/lib/server/ingestion/cron-auth";
import { serverFirestore } from "@/lib/server/ingestion/firebase-admin";
import {
  acquireLease,
  releaseLeaseBestEffort,
} from "@/lib/server/ingestion/lease";
import { isSourceGroup } from "@/lib/server/ingestion/source-registry";
import { resolvedSourcesForGroup } from "@/lib/server/ingestion/source-overrides";
import {
  makeIngestionWindow,
  runIngestion,
} from "@/lib/server/ingestion/runner";
import { loadCommunityConfig } from "@/lib/server/ingestion/community-config";

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
  if (!cronFeatureEnabled("ingest")) {
    return NextResponse.json({ error: "Event ingestion is disabled" }, { status: 503 });
  }
  const group = request.nextUrl.searchParams.get("group") ?? "";
  if (!isSourceGroup(group)) {
    return NextResponse.json({ error: "A valid source group is required" }, { status: 400 });
  }

  const now = new Date();
  const deadlineAt = new Date(now.getTime() + 50_000);
  const db = serverFirestore();
  // Horizon is configuration, not a constant: a 30 day window discarded the
  // town's largest annual events, and the right depth varies by community.
  const community = await loadCommunityConfig(db);
  const resolved = await resolvedSourcesForGroup(db, group);
  const end = new Date(now);
  end.setDate(end.getDate() + community.horizonDays);
  const runId = randomUUID();
  const leaseKey = `event-ingest:${group}`;
  const claim = await acquireLease({ db, key: leaseKey, owner: runId });
  if (!claim.acquired) {
    return NextResponse.json({ status: "skipped", reason: "lease-active", group });
  }

  try {
    const result = await runIngestion({
      db,
      sources: resolved.sources,
      window: makeIngestionWindow({
        fromLocalDate: localDate(now),
        toLocalDate: localDate(end),
      }),
      community,
      write: true,
      runId,
      checkedAt: now,
      deadlineAt,
    });
    return NextResponse.json(result, {
      status: result.status === "failed" ? 500 : result.status === "partial" ? 207 : 200,
    });
  } finally {
    await releaseLeaseBestEffort({ db, key: leaseKey, owner: runId });
  }
}
