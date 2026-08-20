/**
 * Approved-source event ingestion.
 *
 * Dry run is the default. Production writes require both --write and --prod.
 *
 * Examples:
 *   npx tsx scripts/ingest-events.ts --group core-libraries
 *   npx tsx scripts/ingest-events.ts --source westfield-schools-ical
 *   npx tsx scripts/ingest-events.ts --write --prod --group nearby-venues
 */
import { currentDatabaseName, serverFirestore } from "../src/lib/server/ingestion/firebase-admin";
import {
  EVENT_SOURCES,
  isSourceGroup,
  sourceById,
  sourcesForGroup,
} from "./event-sources";
import {
  makeIngestionWindow,
  runIngestion,
} from "../src/lib/server/ingestion/runner";

const args = process.argv.slice(2);

function argument(flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function localDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function selectedSources() {
  const sourceId = argument("--source");
  if (sourceId) {
    const source = sourceById(sourceId);
    if (!source) throw new Error(`Unknown source: ${sourceId}`);
    return [source];
  }
  const group = argument("--group");
  if (group) {
    if (!isSourceGroup(group)) throw new Error(`Unknown source group: ${group}`);
    return sourcesForGroup(group);
  }
  return EVENT_SOURCES;
}

async function main() {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 30);
  const fromLocalDate = argument("--from") ?? localDate(now);
  const toLocalDate = argument("--to") ?? localDate(end);
  const write = args.includes("--write");
  const prod = args.includes("--prod");
  if (prod && !write) {
    throw new Error("--prod is only valid with --write");
  }
  const database = prod ? "westfieldbuzz-prod" : currentDatabaseName();
  const sources = selectedSources();
  const result = await runIngestion({
    db: serverFirestore(database),
    sources,
    window: makeIngestionWindow({ fromLocalDate, toLocalDate }),
    write,
  });

  console.log(
    JSON.stringify(
      {
        mode: write ? "write" : "dry-run",
        database,
        ...result,
      },
      null,
      2
    )
  );
  process.exitCode = result.status === "success" ? 0 : result.status === "partial" ? 2 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
