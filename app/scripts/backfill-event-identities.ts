/**
 * Backfill event identity evidence and registry claims.
 *
 * Dry-run is the default. Use --apply to write only unambiguous entries.
 * Add --prod when deliberately targeting the production named database.
 */
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import {
  applyIdentityBackfill,
  planIdentityBackfill,
  type IdentityBackfillEntry,
} from "../src/lib/server/ingestion/identity-backfill";
import { serverFirestore } from "../src/lib/server/ingestion/firebase-admin";

const args = process.argv.slice(2);

function help() {
  console.log(`Usage: npx tsx scripts/backfill-event-identities.ts [--apply] [--prod]

Reports proposed event identity fields and eventFingerprintRegistry claims.
No writes occur unless --apply is provided. --prod selects westfieldbuzz-prod.`);
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate();
  }
  return null;
}

async function main() {
  if (args.includes("--help") || args.includes("-h")) {
    help();
    return;
  }
  const apply = args.includes("--apply");
  const prod = args.includes("--prod");
  const database = prod ? "westfieldbuzz-prod" : "westfieldbuzz-dev";
  const db = serverFirestore(database);
  const [eventsSnapshot, sourceSnapshot, registrySnapshot] = await Promise.all([
    db.collection("events").get(),
    db.collection("eventSources").get(),
    db.collection("eventFingerprintRegistry").get(),
  ]);
  const plan = planIdentityBackfill({
    events: eventsSnapshot.docs.map((document) => {
      const data = document.data();
      const date = dateValue(data.date);
      return {
            id: document.id,
            title: typeof data.title === "string" ? data.title : undefined,
            date,
            location: typeof data.location === "string" ? data.location : undefined,
            town: typeof data.town === "string" ? data.town : undefined,
            sourceId: typeof data.sourceId === "string" ? data.sourceId : undefined,
            sourceEventId: typeof data.sourceEventId === "string" ? data.sourceEventId : undefined,
            identityFingerprint: typeof data.identityFingerprint === "string"
              ? data.identityFingerprint
              : undefined,
          };
    }),
    sourceEventIds: new Set(sourceSnapshot.docs
      .map((document) => document.data().eventId)
      .filter((eventId): eventId is string => typeof eventId === "string")),
    registry: registrySnapshot.docs.map((document) => ({
      fingerprint: document.id,
      eventId: typeof document.data().eventId === "string" ? document.data().eventId : undefined,
      sourceId: typeof document.data().sourceId === "string" ? document.data().sourceId : undefined,
    })),
  });

  const result = await applyIdentityBackfill(plan, async (entry: IdentityBackfillEntry) => {
    const eventRef = db.collection("events").doc(entry.event.id);
    const registryRef = db.collection("eventFingerprintRegistry").doc(entry.identity.hash);
    return db.runTransaction(async (transaction) => {
      const [event, registry] = await Promise.all([
        transaction.get(eventRef),
        transaction.get(registryRef),
      ]);
      if (!event.exists) return false;
      const data = event.data();
      if (data?.identityFingerprint && data.identityFingerprint !== entry.identity.hash) return false;
      if (registry.exists && registry.data()?.eventId !== entry.event.id) return false;
      if (!registry.exists) {
        transaction.set(registryRef, {
          version: entry.identity.version,
          fingerprint: entry.identity.hash,
          evidence: entry.identity.evidence,
          eventId: entry.event.id,
          sourceId: entry.event.sourceId,
          sourceEventId: entry.event.sourceEventId,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      transaction.set(eventRef, {
        identityFingerprint: entry.identity.hash,
        identityEvidence: entry.identity.evidence,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return true;
    });
  }, apply);

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    database,
    proposed: plan.entries.length,
    duplicateFingerprints: plan.duplicateFingerprints,
    fieldConflicts: plan.fieldConflicts,
    orphanEvents: plan.orphanEvents,
    orphanRegistryEntries: plan.orphanRegistryEntries,
    registryConflicts: plan.registryConflicts,
    invalidEvents: plan.invalidEvents,
    writes: result,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
