import { randomUUID } from "node:crypto";
import {
  FieldValue,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";
import { fetchSourceEvents } from "./adapters";
import type { FetchImplementation } from "./safe-fetch";
import { reconcileSource } from "./firestore-repository";
import { parseSourceDateTime } from "./time";
import type {
  EventSourcePolicy,
  SourceRunResult,
} from "./types";

export interface IngestionWindow {
  from: Date;
  to: Date;
  fromLocalDate: string;
  toLocalDate: string;
}

export interface IngestionRunResult {
  runId: string;
  status: "success" | "partial" | "failed";
  sourceResults: SourceRunResult[];
  totals: {
    fetched: number;
    created: number;
    updated: number;
    verified: number;
    missing: number;
    stale: number;
    candidates: number;
    safetyHeld: boolean;
    errors: number;
  };
}

export function makeIngestionWindow(input: {
  fromLocalDate: string;
  toLocalDate: string;
  timezone?: string;
}): IngestionWindow {
  const timezone = input.timezone ?? "America/New_York";
  const from = parseSourceDateTime(
    `${input.fromLocalDate} 00:00:00`,
    timezone
  );
  const to = parseSourceDateTime(`${input.toLocalDate} 23:59:59`, timezone);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new Error("Invalid ingestion date window");
  }
  return { ...input, from, to };
}

function sourceStatus(
  errors: string[],
  fetched: number
): SourceRunResult["status"] {
  if (errors.length === 0) return "success";
  return fetched > 0 ? "partial" : "failed";
}

export function countAnomaly(input: {
  previousCount: number;
  currentCount: number;
  floorRatio: number;
}): string | null {
  if (
    !Number.isFinite(input.previousCount) ||
    input.previousCount <= 0 ||
    input.currentCount <= 0 ||
    input.currentCount / input.previousCount >= input.floorRatio
  ) {
    return null;
  }
  const ratio = input.currentCount / input.previousCount;
  return `Event count fell from ${input.previousCount} to ${input.currentCount} (${Math.round(
    ratio * 100
  )}% of baseline)`;
}

async function applyBaselineAnomaly(input: {
  db: Firestore;
  source: EventSourcePolicy;
  count: number;
  complete: boolean;
}): Promise<string | null> {
  if (!input.complete || !input.source.anomalyFloorRatio || input.count === 0) {
    return null;
  }
  const snapshot = await input.db
    .collection("eventSourceHealth")
    .doc(input.source.id)
    .get();
  const previousCount = Number(snapshot.data()?.lastSuccessfulCount);
  return countAnomaly({
    previousCount,
    currentCount: input.count,
    floorRatio: input.source.anomalyFloorRatio,
  });
}

async function persistSourceHealth(input: {
  db: Firestore;
  source: EventSourcePolicy;
  result: SourceRunResult;
  checkedAt: Date;
}): Promise<void> {
  const healthy = input.result.status === "success" && !input.result.safetyHeld;
  const nextExpectedRunAt = new Date(
    input.checkedAt.getTime() + input.source.freshnessThresholdHours * 60 * 60_000
  );
  await input.db.collection("eventSourceHealth").doc(input.source.id).set(
    {
      sourceId: input.source.id,
      sourceName: input.source.name,
      group: input.source.group,
      status: input.result.status,
      fetched: input.result.fetched,
      errors: input.result.errors,
      warnings: input.result.warnings,
      safetyHeld: input.result.safetyHeld,
      checkedAt: Timestamp.fromDate(input.checkedAt),
      nextExpectedRunAt: Timestamp.fromDate(nextExpectedRunAt),
      consecutiveFailures: healthy ? 0 : FieldValue.increment(1),
      ...(healthy
        ? {
            lastSuccessfulAt: Timestamp.fromDate(input.checkedAt),
            lastSuccessfulCount: input.result.fetched,
          }
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function runSource(input: {
  db: Firestore;
  source: EventSourcePolicy;
  window: IngestionWindow;
  write: boolean;
  checkedAt: Date;
  fetchImpl?: FetchImplementation;
}): Promise<SourceRunResult> {
  const started = Date.now();
  try {
    const fetched = await fetchSourceEvents({
      source: input.source,
      window: input.window,
      fetchImpl: input.fetchImpl,
    });
    const anomaly = await applyBaselineAnomaly({
      db: input.db,
      source: input.source,
      count: fetched.events.length,
      complete: fetched.complete,
    });
    const errors = anomaly ? [...fetched.errors, anomaly] : fetched.errors;
    const complete = fetched.complete && !anomaly;
    const reconciliation = await reconcileSource({
      db: input.db,
      source: input.source,
      observations: fetched.events,
      checkedAt: input.checkedAt,
      from: input.window.from,
      to: input.window.to,
      complete,
      write: input.write,
    });
    const result: SourceRunResult = {
      sourceId: input.source.id,
      sourceName: input.source.name,
      status: sourceStatus(errors, fetched.events.length),
      fetched: fetched.events.length,
      created: reconciliation.created,
      updated: reconciliation.updated,
      verified: reconciliation.verified,
      missing: reconciliation.missing,
      stale: reconciliation.stale,
      candidates: reconciliation.candidates,
      safetyHeld: reconciliation.safetyHeld || Boolean(anomaly),
      errors,
      warnings: fetched.warnings,
      durationMs: Date.now() - started,
    };
    if (input.write) {
      await persistSourceHealth({
        db: input.db,
        source: input.source,
        result,
        checkedAt: input.checkedAt,
      });
    }
    return result;
  } catch (error) {
    const result: SourceRunResult = {
      sourceId: input.source.id,
      sourceName: input.source.name,
      status: "failed",
      fetched: 0,
      created: 0,
      updated: 0,
      verified: 0,
      missing: 0,
      stale: 0,
      candidates: 0,
      safetyHeld: true,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
      durationMs: Date.now() - started,
    };
    if (input.write) {
      await persistSourceHealth({
        db: input.db,
        source: input.source,
        result,
        checkedAt: input.checkedAt,
      });
    }
    return result;
  }
}

function totals(results: SourceRunResult[]): IngestionRunResult["totals"] {
  return results.reduce<IngestionRunResult["totals"]>(
    (summary, result) => ({
      fetched: summary.fetched + result.fetched,
      created: summary.created + result.created,
      updated: summary.updated + result.updated,
      verified: summary.verified + result.verified,
      missing: summary.missing + result.missing,
      stale: summary.stale + result.stale,
      candidates: summary.candidates + result.candidates,
      safetyHeld: summary.safetyHeld || result.safetyHeld,
      errors: summary.errors + result.errors.length,
    }),
    {
      fetched: 0,
      created: 0,
      updated: 0,
      verified: 0,
      missing: 0,
      stale: 0,
      candidates: 0,
      safetyHeld: false,
      errors: 0,
    }
  );
}

export async function runIngestion(input: {
  db: Firestore;
  sources: EventSourcePolicy[];
  window: IngestionWindow;
  write: boolean;
  runId?: string;
  checkedAt?: Date;
  fetchImpl?: FetchImplementation;
}): Promise<IngestionRunResult> {
  const runId = input.runId ?? randomUUID();
  const checkedAt = input.checkedAt ?? new Date();
  const runRef = input.db.collection("crawlRuns").doc(runId);
  if (input.write) {
    await runRef.set({
      status: "running",
      mode: "collection",
      sourceIds: input.sources.map((source) => source.id),
      fromDate: input.window.fromLocalDate,
      toDate: input.window.toLocalDate,
      startedAt: Timestamp.fromDate(checkedAt),
    });
  }

  const sourceResults: SourceRunResult[] = [];
  for (const source of input.sources) {
    const result = await runSource({ ...input, source, checkedAt });
    sourceResults.push(result);
    if (input.write) {
      await runRef.collection("sources").doc(source.id).set(result);
    }
  }

  const failed = sourceResults.filter((result) => result.status === "failed").length;
  const nonSuccess = sourceResults.filter((result) => result.status !== "success").length;
  const status =
    sourceResults.length > 0 && failed === sourceResults.length
      ? "failed"
      : nonSuccess > 0
        ? "partial"
        : "success";
  const summary = totals(sourceResults);
  if (input.write) {
    await runRef.set(
      {
        status,
        ...summary,
        finishedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  return { runId, status, sourceResults, totals: summary };
}
