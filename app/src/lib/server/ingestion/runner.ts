import { randomUUID } from "node:crypto";
import {
  FieldValue,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";
import { checkLocation, type LocationPolicy } from "./location-guard";
import { loadCommunityConfig } from "./community-config";
import { fetchSourceEvents } from "./adapters";
import type { FetchImplementation } from "./safe-fetch";
import { reconcileSource } from "./firestore-repository";
import { parseSourceDateTime } from "./time";
import type {
  EventSourcePolicy,
  SourceObservation,
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
  /** Bookkeeping failures that did not change the actual crawl outcome. */
  warnings: string[];
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

export const INGESTION_CONCURRENCY = 2;
export const CLEANUP_RESERVE_MS = 2_000;

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
      created: input.result.created,
      updated: input.result.updated,
      verified: input.result.verified,
      missing: input.result.missing,
      stale: input.result.stale,
      candidates: input.result.candidates,
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

/**
 * Drop observations whose own stated location is outside the community radius.
 *
 * The pipeline stamps `town` from source configuration, so without this a
 * regional listing page produces out-of-area events labelled as local. When an
 * event's location text does not resolve (common for official feeds that say
 * only "Community Room"), fall back to the source's configured town rather than
 * discarding it, so existing single-town feeds are unaffected.
 */
function filterByLocation(
  source: EventSourcePolicy,
  observations: SourceObservation[],
  policy: LocationPolicy
): { kept: SourceObservation[]; warnings: string[] } {
  const kept: SourceObservation[] = [];
  const rejected: string[] = [];
  for (const observation of observations) {
    let verdict = checkLocation({ location: observation.location ?? "", policy });
    if (verdict.status === "unknown") {
      verdict = checkLocation({ location: observation.town ?? source.town ?? "", policy });
    }
    if (verdict.status === "too-far") {
      rejected.push(`${observation.title} (${verdict.place}, ${verdict.miles.toFixed(1)} mi)`);
      continue;
    }
    kept.push(observation);
  }
  const warnings = rejected.length
    ? [`Filtered ${rejected.length} out-of-area event(s): ${rejected.slice(0, 5).join("; ")}`]
    : [];
  return { kept, warnings };
}

async function runSource(input: {
  db: Firestore;
  source: EventSourcePolicy;
  window: IngestionWindow;
  write: boolean;
  checkedAt: Date;
  fetchImpl?: FetchImplementation;
  deadlineAt?: Date;
  locationPolicy: LocationPolicy;
}): Promise<SourceRunResult> {
  const started = Date.now();
  let result: SourceRunResult;
  try {
    const fetched = await fetchSourceEvents({
      source: input.source,
      window: input.window,
      fetchImpl: input.fetchImpl,
      deadlineAt: input.deadlineAt,
    });
    const anomaly = await applyBaselineAnomaly({
      db: input.db,
      source: input.source,
      count: fetched.events.length,
      complete: fetched.complete,
    });
    const errors = anomaly ? [...fetched.errors, anomaly] : fetched.errors;
    const complete = fetched.complete && !anomaly;
    const local = filterByLocation(input.source, fetched.events, input.locationPolicy);
    const reconciliation = await reconcileSource({
      db: input.db,
      source: input.source,
      observations: local.kept,
      checkedAt: input.checkedAt,
      from: input.window.from,
      to: input.window.to,
      complete,
      write: input.write,
      deadlineAt: input.deadlineAt,
    });
    result = {
      sourceId: input.source.id,
      sourceName: input.source.name,
      status: "incomplete" in reconciliation && reconciliation.incomplete ? "partial" : sourceStatus(errors, fetched.events.length),
      fetched: fetched.events.length,
      created: reconciliation.created,
      updated: reconciliation.updated,
      verified: reconciliation.verified,
      missing: reconciliation.missing,
      stale: reconciliation.stale,
      candidates: reconciliation.candidates,
      safetyHeld: reconciliation.safetyHeld || Boolean(anomaly),
      errors,
      warnings: [...fetched.warnings, ...local.warnings],
      ...("incomplete" in reconciliation && reconciliation.incomplete ? { incomplete: true, warnings: [...fetched.warnings, "Deadline reached; only committed writes are reported"] } : {}),
      durationMs: Date.now() - started,
    };
  } catch (error) {
    result = {
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
  }

  // Health records are observability, not part of reconciliation. In particular,
  // do not turn an already-successful reconcile into a failure (or execute it again)
  // because its health record could not be saved.
  if (input.write) {
    try {
      await persistSourceHealth({
        db: input.db,
        source: input.source,
        result,
        checkedAt: input.checkedAt,
      });
    } catch (error) {
      const message = `Health persistence failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
      result.warnings.push(message);
      console.error({
        event: "ingestion.health_persist_failed",
        sourceId: input.source.id,
        error: message,
      });
    }
  }
  return result;
}

function deadlineHeldResult(source: EventSourcePolicy): SourceRunResult {
  return {
    sourceId: source.id,
    sourceName: source.name,
    status: "failed",
    fetched: 0,
    created: 0,
    updated: 0,
    verified: 0,
    missing: 0,
    stale: 0,
    candidates: 0,
    safetyHeld: true,
    errors: ["Global crawl deadline exhausted before source could start"],
    warnings: [],
    durationMs: 0,
  };
}

function mayStartBeforeDeadline(deadlineAt?: Date): boolean {
  return !deadlineAt || Date.now() + CLEANUP_RESERVE_MS < deadlineAt.getTime();
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
  deadlineAt?: Date;
}): Promise<IngestionRunResult> {
  const runId = input.runId ?? randomUUID();
  const checkedAt = input.checkedAt ?? new Date();
  const runRef = input.db.collection("crawlRuns").doc(runId);
  const warnings: string[] = [];
  if (input.write) {
    try {
      await runRef.set({
        status: "running",
        mode: "collection",
        sourceIds: input.sources.map((source) => source.id),
        fromDate: input.window.fromLocalDate,
        toDate: input.window.toLocalDate,
        startedAt: Timestamp.fromDate(checkedAt),
      });
    } catch (error) {
      const message = `Run ledger start failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
      warnings.push(message);
      console.error({ event: "ingestion.run_start_failed", runId, error: message });
    }
  }

  // One read per run, shared by every source, so tuning the radius or adding a
  // place takes effect on the next run without a deploy.
  const community = await loadCommunityConfig(input.db);
  warnings.push(...community.warnings);

  const sourceResults = new Array<SourceRunResult | undefined>(input.sources.length);
  let nextSource = 0;
  const worker = async () => {
    while (true) {
      if (!mayStartBeforeDeadline(input.deadlineAt)) return;
      const index = nextSource;
      nextSource += 1;
      if (index >= input.sources.length) return;
      const source = input.sources[index];
      const result = await runSource({
        ...input, source, checkedAt, locationPolicy: community.location,
      });
      sourceResults[index] = result;
      if (input.write) {
        try {
          await runRef.collection("sources").doc(source.id).set(result);
        } catch (error) {
          const message = `Source ledger write failed: ${
            error instanceof Error ? error.message : String(error)
          }`;
          result.warnings.push(message);
          warnings.push(`${source.id}: ${message}`);
          console.error({
            event: "ingestion.source_ledger_failed",
            runId,
            sourceId: source.id,
            error: message,
          });
        }
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(INGESTION_CONCURRENCY, input.sources.length) },
      worker
    )
  );
  for (let index = 0; index < input.sources.length; index += 1) {
    sourceResults[index] ??= deadlineHeldResult(input.sources[index]);
  }
  const orderedResults = sourceResults as SourceRunResult[];

  const failed = orderedResults.filter((result) => result.status === "failed").length;
  const nonSuccess = orderedResults.filter((result) => result.status !== "success").length;
  const status =
    orderedResults.length > 0 && failed === orderedResults.length
      ? "failed"
      : nonSuccess > 0
        ? "partial"
        : "success";
  const summary = totals(orderedResults);
  if (input.write) {
    try {
      await runRef.set(
        {
          status,
          ...summary,
          finishedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      const message = `Run ledger finalize failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
      warnings.push(message);
      console.error({ event: "ingestion.run_finalize_failed", runId, error: message });
    }
  }
  return { runId, status, sourceResults: orderedResults, warnings, totals: summary };
}
