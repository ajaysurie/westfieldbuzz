/**
 * Event Ingestion Pipeline
 *
 * Fetches events from approved public sources and reconciles them against
 * Firestore so changed times, cancellations, and missing events propagate.
 *
 * Usage:
 *   npx tsx scripts/ingest-events.ts                    # Dry run against westfieldbuzz-dev
 *   npx tsx scripts/ingest-events.ts --write            # Write to westfieldbuzz-dev
 *   npx tsx scripts/ingest-events.ts --write --prod     # Write to westfieldbuzz-prod
 *   npx tsx scripts/ingest-events.ts --from 2026-03-01 --to 2026-04-30
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { EVENT_SOURCES, mapCategory, type EventSource } from "./event-sources";
import { reconcileSource } from "../src/lib/server/ingestion/firestore-repository";
import { parseSourceDateTime } from "../src/lib/server/ingestion/time";
import type { SourceObservation } from "../src/lib/server/ingestion/types";

// ===== Types =====

type IngestedEvent = SourceObservation;

interface FetchResult {
  events: IngestedEvent[];
  complete: boolean;
  errors: string[];
}

// ===== CLI Args =====

const args = process.argv.slice(2);
const isProd = args.includes("--prod");
const isWrite = args.includes("--write");
const dbName = isProd ? "westfieldbuzz-prod" : "westfieldbuzz-dev";

function getArgValue(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const today = new Date();
const thirtyDaysFromNow = new Date(today);
thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

const fromDate = getArgValue("--from") || today.toISOString().split("T")[0];
const toDate = getArgValue("--to") || thirtyDaysFromNow.toISOString().split("T")[0];

// ===== Firebase Setup =====

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "westfieldbuzz",
});

const db = getFirestore(app, dbName);

// ===== HTML Stripping =====

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ===== LibCal Fetcher =====

async function fetchLibCalEvents(
  source: EventSource,
  from: string,
  to: string
): Promise<FetchResult> {
  const events: IngestedEvent[] = [];
  const fromBoundary = parseSourceDateTime(`${from} 00:00:00`, source.timezone);
  const toBoundary = parseSourceDateTime(`${to} 23:59:59`, source.timezone);
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${source.url}?c=${source.calendarId}&date=${from}&perpage=50&page=${page}`;
    console.log(`  Fetching: ${url}`);

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}`);
    }

    const data = await res.json();
    const eventList = data.events || data.results || [];

    if (eventList.length === 0) {
      hasMore = false;
      break;
    }

    // Log first event structure on page 1 for debugging
    if (page === 1) {
      console.log(`  Sample event keys: ${Object.keys(eventList[0]).join(", ")}`);
    }

    for (const evt of eventList) {
      // Parse start date — prefer startdt (full datetime) over start (time-only in LibCal)
      const startRaw = evt.startdt || evt.start_date || evt.start;
      const endRaw = evt.enddt || evt.end_date || evt.end;

      if (!startRaw) {
        console.warn(`  Skipping event "${evt.title}" — no start date`);
        continue;
      }

      const startDate = parseSourceDateTime(startRaw, source.timezone);
      let endDate = endRaw
        ? parseSourceDateTime(endRaw, source.timezone)
        : null;
      if (Number.isNaN(startDate.getTime())) {
        console.warn(`  Skipping event "${evt.title}" — invalid start date`);
        continue;
      }
      if (endDate && Number.isNaN(endDate.getTime())) {
        console.warn(`  Ignoring invalid end date for "${evt.title}"`);
        endDate = null;
      }

      // Filter by date range
      if (startDate > toBoundary) continue;
      if (endDate && endDate < fromBoundary) continue;

      // Extract categories from various LibCal fields
      const categories: string[] = [];
      if (Array.isArray(evt.categories_arr)) {
        for (const c of evt.categories_arr) {
          if (c?.name) categories.push(c.name);
        }
      }
      if (Array.isArray(evt.audiences)) {
        for (const a of evt.audiences) {
          if (a?.name) categories.push(a.name);
        }
      }
      if (Array.isArray(evt.categories)) {
        for (const c of evt.categories) {
          if (typeof c === "string") categories.push(c);
          else if (c?.name) categories.push(c.name);
        }
      } else if (typeof evt.categories === "string") {
        categories.push(evt.categories);
      }

      events.push({
        title: stripHtml(evt.title || ""),
        description: stripHtml(evt.description || evt.shortdesc || ""),
        date: startDate,
        endDate,
        location: evt.location?.name || evt.location || source.name,
        category: mapCategory(categories),
        status: String(evt.status ?? "").toLowerCase().includes("cancel")
          ? "cancelled"
          : "scheduled",
        availability: "unknown",
        sourceId: source.id,
        sourceEventId:
          evt.id != null
            ? String(evt.id)
            : `fallback:${startDate.toISOString()}:${stripHtml(evt.title || "")}:${
                evt.location?.name || evt.location || source.name
              }`,
        sourceUrl: evt.url?.public || evt.url || "",
        town: source.town,
      });
    }

    page++;
    if (eventList.length < 50) hasMore = false;
  }

  return { events, complete: true, errors: [] };
}

// ===== CivicPlus iCal Fetcher =====

async function fetchICalEvents(source: EventSource): Promise<FetchResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeIcal = require("node-ical");
  const events: IngestedEvent[] = [];
  const errors: string[] = [];
  const fromBoundary = parseSourceDateTime(
    `${fromDate} 00:00:00`,
    source.timezone
  );
  const toBoundary = parseSourceDateTime(
    `${toDate} 23:59:59`,
    source.timezone
  );

  for (const catId of source.calendarIds || []) {
    const url = `${source.url}?catID=${catId}&feed=calendar`;
    console.log(`  Fetching: ${url}`);

    try {
      const data = await nodeIcal.async.fromURL(url);

      for (const [key, value] of Object.entries(data)) {
        // node-ical returns various types; only process VEVENTs
        const evt = value as any;
        if (evt.type !== "VEVENT") continue;

        const startDate = evt.start ? new Date(evt.start) : null;
        const endDate = evt.end ? new Date(evt.end) : null;

        if (!startDate || isNaN(startDate.getTime())) {
          console.warn(`  Skipping iCal event "${evt.summary}" — invalid start date`);
          continue;
        }

        // Filter by date range
        if (startDate > toBoundary) continue;
        if (endDate && endDate < fromBoundary) continue;
        if (!endDate && startDate < fromBoundary) continue;

        events.push({
          title: (evt.summary || "").trim(),
          description: stripHtml(evt.description || ""),
          date: startDate,
          endDate,
          location: (evt.location || "").trim(),
          category: mapCategory([source.name]),
          status: String(evt.status ?? "").toUpperCase() === "CANCELLED"
            ? "cancelled"
            : "scheduled",
          availability: "unknown",
          sourceId: source.id,
          sourceEventId: evt.uid || key,
          sourceUrl: "",
          town: source.town,
        });
      }
    } catch (err) {
      console.error(`  Error fetching iCal for ${source.name} catID=${catId}:`, err);
      errors.push(
        `catID=${catId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { events, complete: errors.length === 0, errors };
}

// ===== Main =====

async function main() {
  console.log("=== WestfieldBuzz Event Ingestion ===");
  console.log(`Database: ${dbName}${isProd ? " (PRODUCTION)" : ""}`);
  console.log(`Date range: ${fromDate} to ${toDate}`);
  console.log(`Mode: ${isWrite ? "WRITE" : "DRY RUN (use --write to persist)"}`);
  console.log("");

  let totalFetched = 0;
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalVerified = 0;
  let totalMissing = 0;
  let totalStale = 0;
  let totalCandidates = 0;
  let totalErrors = 0;

  const runRef = db.collection("crawlRuns").doc();
  if (isWrite) {
    await runRef.set({
      status: "running",
      database: dbName,
      fromDate,
      toDate,
      sourceCount: EVENT_SOURCES.length,
      startedAt: FieldValue.serverTimestamp(),
    });
  }

  for (const source of EVENT_SOURCES) {
    console.log(`\n[${source.id}] ${source.name} (${source.type})`);

    let result: FetchResult;
    try {
      if (source.type === "libcal") {
        result = await fetchLibCalEvents(source, fromDate, toDate);
      } else if (source.type === "civicplus-ical") {
        result = await fetchICalEvents(source);
      } else {
        throw new Error(`Unsupported source type: ${source.type}`);
      }
    } catch (err) {
      console.error(`  Fatal error fetching ${source.name}:`, err);
      totalErrors++;
      if (isWrite) {
        await runRef.collection("sources").doc(source.id).set({
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
          finishedAt: FieldValue.serverTimestamp(),
        });
      }
      continue;
    }

    const { events } = result;
    console.log(`  Fetched ${events.length} events`);
    totalFetched += events.length;

    if (!result.complete) {
      console.warn("  Source fetch incomplete; missing-event aging is disabled");
      totalErrors += result.errors.length;
    }

    try {
      const reconciliation = await reconcileSource({
        db,
        source,
        observations: events,
        checkedAt: new Date(),
        from: parseSourceDateTime(`${fromDate} 00:00:00`, source.timezone),
        to: parseSourceDateTime(`${toDate} 23:59:59`, source.timezone),
        complete: result.complete,
        write: isWrite,
      });

      totalCreated += reconciliation.created;
      totalUpdated += reconciliation.updated;
      totalVerified += reconciliation.verified;
      totalMissing += reconciliation.missing;
      totalStale += reconciliation.stale;
      totalCandidates += reconciliation.candidates;
      if (reconciliation.safetyHeld) {
        totalErrors++;
        console.warn(
          "  Empty-result safety hold: existing events were not aged as missing"
        );
      }

      console.log(
        `  Reconciled: ${reconciliation.created} created, ${reconciliation.updated} updated, ` +
          `${reconciliation.verified} verified, ${reconciliation.missing} missing, ` +
          `${reconciliation.stale} stale, ${reconciliation.candidates} candidates`
      );

      for (const action of reconciliation.actions) {
        const marker =
          action.type === "create"
            ? "+"
            : action.type === "update"
              ? "~"
              : action.type === "stale"
                ? "!"
                : "·";
        console.log(`    ${marker} [${action.type}] ${action.event.title}`);
      }

      if (isWrite) {
        await runRef.collection("sources").doc(source.id).set({
          status:
            result.complete && !reconciliation.safetyHeld
              ? "success"
              : "partial",
          fetched: events.length,
          created: reconciliation.created,
          updated: reconciliation.updated,
          verified: reconciliation.verified,
          missing: reconciliation.missing,
          stale: reconciliation.stale,
          candidates: reconciliation.candidates,
          errors: result.errors,
          safetyHeld: reconciliation.safetyHeld,
          finishedAt: FieldValue.serverTimestamp(),
        });
      }
    } catch (err) {
      console.error(`  Error reconciling events for ${source.id}:`, err);
      totalErrors++;
      if (isWrite) {
        await runRef.collection("sources").doc(source.id).set({
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
          finishedAt: FieldValue.serverTimestamp(),
        });
      }
    }
  }

  console.log("\n=== Summary ===");
  console.log(`  Sources processed: ${EVENT_SOURCES.length}`);
  console.log(`  Events fetched:    ${totalFetched}`);
  console.log(`  Events created:    ${totalCreated}`);
  console.log(`  Events updated:    ${totalUpdated}`);
  console.log(`  Events verified:   ${totalVerified}`);
  console.log(`  Events missing:    ${totalMissing}`);
  console.log(`  Events stale:      ${totalStale}`);
  console.log(`  Review candidates: ${totalCandidates}`);
  if (totalErrors > 0) {
    console.log(`  Errors:            ${totalErrors}`);
  }
  if (!isWrite) {
    console.log("\n  (Dry run — no events written. Use --write to persist.)");
  } else {
    await runRef.set(
      {
        status: totalErrors > 0 ? "partial" : "success",
        fetched: totalFetched,
        created: totalCreated,
        updated: totalUpdated,
        verified: totalVerified,
        missing: totalMissing,
        stale: totalStale,
        candidates: totalCandidates,
        errorCount: totalErrors,
        finishedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
