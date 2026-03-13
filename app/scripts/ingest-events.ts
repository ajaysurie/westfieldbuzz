/**
 * Event Ingestion Pipeline
 *
 * Fetches events from public sources (LibCal, CivicPlus iCal) and writes
 * them to Firestore, deduplicating by sourceId + sourceEventId.
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

// ===== Types =====

interface IngestedEvent {
  title: string;
  description: string;
  date: Date;
  endDate: Date | null;
  location: string;
  category: string;
  sourceId: string;
  sourceEventId: string;
  sourceUrl: string;
  town: string;
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
): Promise<IngestedEvent[]> {
  const events: IngestedEvent[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${source.url}?c=${source.calendarId}&date=${from}&perpage=50&page=${page}`;
    console.log(`  Fetching: ${url}`);

    const res = await fetch(url);
    if (!res.ok) {
      console.error(`  HTTP ${res.status} from ${url}`);
      break;
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

      // LibCal startdt format is "2026-03-13 10:00:00" (no timezone) — add T separator for reliable parsing
      const startDate = new Date(String(startRaw).replace(" ", "T"));
      const endDate = endRaw ? new Date(String(endRaw).replace(" ", "T")) : null;

      // Filter by date range
      if (startDate > new Date(to + "T23:59:59")) continue;
      if (endDate && endDate < new Date(from + "T00:00:00")) continue;

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
        sourceId: source.id,
        sourceEventId: String(evt.id),
        sourceUrl: evt.url?.public || evt.url || "",
        town: source.town,
      });
    }

    page++;
    if (eventList.length < 50) hasMore = false;
  }

  return events;
}

// ===== CivicPlus iCal Fetcher =====

async function fetchICalEvents(source: EventSource): Promise<IngestedEvent[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeIcal = require("node-ical");
  const events: IngestedEvent[] = [];

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
        const fromD = new Date(fromDate + "T00:00:00");
        const toD = new Date(toDate + "T23:59:59");
        if (startDate > toD) continue;
        if (endDate && endDate < fromD) continue;
        if (!endDate && startDate < fromD) continue;

        events.push({
          title: (evt.summary || "").trim(),
          description: stripHtml(evt.description || ""),
          date: startDate,
          endDate,
          location: (evt.location || "").trim(),
          category: mapCategory([source.name]),
          sourceId: source.id,
          sourceEventId: evt.uid || key,
          sourceUrl: "",
          town: source.town,
        });
      }
    } catch (err) {
      console.error(`  Error fetching iCal for ${source.name} catID=${catId}:`, err);
    }
  }

  return events;
}

// ===== Deduplication =====

async function getExistingSourceEventIds(sourceId: string): Promise<Set<string>> {
  const snap = await db
    .collection("events")
    .where("sourceId", "==", sourceId)
    .select("sourceEventId")
    .get();

  const ids = new Set<string>();
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.sourceEventId) {
      ids.add(data.sourceEventId);
    }
  }
  return ids;
}

// ===== Main =====

async function main() {
  console.log("=== WestfieldBuzz Event Ingestion ===");
  console.log(`Database: ${dbName}${isProd ? " (PRODUCTION)" : ""}`);
  console.log(`Date range: ${fromDate} to ${toDate}`);
  console.log(`Mode: ${isWrite ? "WRITE" : "DRY RUN (use --write to persist)"}`);
  console.log("");

  let totalFetched = 0;
  let totalNew = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const source of EVENT_SOURCES) {
    console.log(`\n[${source.id}] ${source.name} (${source.type})`);

    let events: IngestedEvent[] = [];
    try {
      if (source.type === "libcal") {
        events = await fetchLibCalEvents(source, fromDate, toDate);
      } else if (source.type === "civicplus-ical") {
        events = await fetchICalEvents(source);
      }
    } catch (err) {
      console.error(`  Fatal error fetching ${source.name}:`, err);
      totalErrors++;
      continue;
    }

    console.log(`  Fetched ${events.length} events`);
    totalFetched += events.length;

    if (events.length === 0) continue;

    // Deduplicate against Firestore
    let existingIds: Set<string>;
    try {
      existingIds = await getExistingSourceEventIds(source.id);
    } catch (err) {
      console.error(`  Error querying existing events for ${source.id}:`, err);
      totalErrors++;
      continue;
    }

    const newEvents = events.filter((e) => !existingIds.has(e.sourceEventId));
    const skipped = events.length - newEvents.length;
    totalSkipped += skipped;

    if (skipped > 0) {
      console.log(`  Skipped ${skipped} duplicates`);
    }

    console.log(`  New events: ${newEvents.length}`);

    for (const evt of newEvents) {
      const dateStr = evt.date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      console.log(`    + [${dateStr}] ${evt.title}`);

      if (isWrite) {
        try {
          const ref = db.collection("events").doc();
          await ref.set({
            title: evt.title,
            description: evt.description,
            date: evt.date,
            endDate: evt.endDate,
            location: evt.location,
            category: evt.category,
            sourceId: evt.sourceId,
            sourceEventId: evt.sourceEventId,
            sourceUrl: evt.sourceUrl,
            town: evt.town,
            interestedCount: 0,
            createdBy: "ingest",
            createdAt: FieldValue.serverTimestamp(),
          });
          totalNew++;
        } catch (err) {
          console.error(`    Error writing "${evt.title}":`, err);
          totalErrors++;
        }
      } else {
        totalNew++;
      }
    }
  }

  // Summary
  console.log("\n=== Summary ===");
  console.log(`  Sources processed: ${EVENT_SOURCES.length}`);
  console.log(`  Events fetched:    ${totalFetched}`);
  console.log(`  Duplicates skipped: ${totalSkipped}`);
  console.log(`  New events:        ${totalNew}`);
  if (totalErrors > 0) {
    console.log(`  Errors:            ${totalErrors}`);
  }
  if (!isWrite) {
    console.log("\n  (Dry run — no events written. Use --write to persist.)");
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
