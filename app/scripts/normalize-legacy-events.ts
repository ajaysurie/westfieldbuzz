/**
 * Report-first legacy event normalizer. Default output is a manifest; it never
 * writes unless an operator supplies a reviewed manifest and --apply. Production
 * is additionally gated by --prod.
 */
import { readFile, writeFile } from "node:fs/promises";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { canApplyNormalizationManifest, manifestHash, planEventNormalization, type EventNormalizationManifest } from "../src/lib/server/ingestion/event-normalization-migration";
import { serverFirestore } from "../src/lib/server/ingestion/firebase-admin";

const args = process.argv.slice(2);
const valueAfter = (flag: string) => args[args.indexOf(flag) + 1];

function help() {
  console.log(`Usage: npx tsx scripts/normalize-legacy-events.ts [--out manifest.json]
       npx tsx scripts/normalize-legacy-events.ts --apply --reviewed-manifest manifest.json [--prod]

Default mode is dry-run and classifies every events document. Apply refuses any
unclassified/non-ready row, requires a reviewed manifest, re-reads every event
inside a transaction, and skips records changed since the manifest.`);
}

function serialize(value: unknown): unknown {
  if (value instanceof Date) return { $date: value.toISOString() };
  if (value instanceof Timestamp) return { $date: value.toDate().toISOString() };
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, serialize(item)]));
  return value;
}

function revive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.$date === "string") return Timestamp.fromDate(new Date(record.$date));
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, revive(item)]));
  }
  return value;
}

async function main() {
  if (args.includes("--help") || args.includes("-h")) return help();
  const apply = args.includes("--apply");
  const prod = args.includes("--prod");
  const reviewedPath = valueAfter("--reviewed-manifest");
  if (apply && !reviewedPath) throw new Error("--apply requires --reviewed-manifest <path>");
  const db = serverFirestore(prod ? "westfieldbuzz-prod" : "westfieldbuzz-dev");

  if (!apply) {
    const [events, sources, registry] = await Promise.all([
      db.collection("events").get(), db.collection("eventSources").get(), db.collection("eventFingerprintRegistry").get(),
    ]);
    const manifest = planEventNormalization({
      events: events.docs.map((document) => ({ id: document.id, data: document.data() })),
      sourceEventIds: new Set(sources.docs.map((document) => document.data().eventId).filter((id): id is string => typeof id === "string")),
      registry: registry.docs.map((document) => ({ fingerprint: document.id, eventId: typeof document.data().eventId === "string" ? document.data().eventId : undefined })),
    });
    const output = JSON.stringify(serialize(manifest), null, 2);
    const out = valueAfter("--out");
    if (out) await writeFile(out, output, "utf8"); else console.log(output);
    return;
  }

  const manifest = revive(JSON.parse(await readFile(reviewedPath!, "utf8"))) as EventNormalizationManifest;
  if (manifest.version !== "event-normalization/v1" || !canApplyNormalizationManifest(manifest)) {
    throw new Error("reviewed manifest must include reviewedAt/reviewedBy and contain only ready records; refusing apply");
  }
  const report = { applied: 0, unchanged: 0, changedSinceManifest: [] as string[], unclassifiable: manifest.rows.filter((row) => row.classification !== "ready").map((row) => row.id) };
  for (const row of manifest.rows) {
    const outcome = await db.runTransaction(async (transaction) => {
      const ref = db.collection("events").doc(row.id);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists || manifestHash(snapshot.data() ?? {}) !== row.beforeHash) return "changed" as const;
      if (!row.proposed || !row.proposedAfterHash) return "unchanged" as const;
      if (manifestHash(snapshot.data() ?? {}) === row.proposedAfterHash) return "unchanged" as const;
      transaction.set(ref, { ...revive(row.proposed) as Record<string, unknown>, updatedAt: FieldValue.serverTimestamp() }, { merge: false });
      return "applied" as const;
    });
    if (outcome === "applied") report.applied += 1;
    if (outcome === "unchanged") report.unchanged += 1;
    if (outcome === "changed") report.changedSinceManifest.push(row.id);
  }
  console.log(JSON.stringify({ mode: "apply", database: prod ? "westfieldbuzz-prod" : "westfieldbuzz-dev", ...report }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
