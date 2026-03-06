/**
 * Clear script: Remove seeded/all businesses from Firestore using Admin SDK
 *
 * Usage:
 *   npx tsx scripts/clear.ts                # Clears all services from dev
 *   npx tsx scripts/clear.ts --seeded-only  # Clears only seeded services from dev
 *   npx tsx scripts/clear.ts --prod         # Clears prod (requires CONFIRM prompt)
 *
 * Auth: Uses Application Default Credentials (run `firebase login` first)
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as readline from "readline";

const isProd = process.argv.includes("--prod");
const seededOnly = process.argv.includes("--seeded-only");
const dbName = isProd ? "westfieldbuzz-prod" : "westfieldbuzz-dev";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "westfieldbuzz",
});

const db = getFirestore(app, dbName);

function askConfirmation(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer === "CONFIRM");
    });
  });
}

async function deleteSubcollection(docRef: FirebaseFirestore.DocumentReference, subcollection: string) {
  const snap = await docRef.collection(subcollection).get();
  if (snap.empty) return 0;

  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return snap.size;
}

async function clear() {
  console.log(`Target database: ${dbName}${isProd ? " (PRODUCTION)" : ""}`);
  console.log(`Mode: ${seededOnly ? "seeded-only" : "all services"}\n`);

  if (isProd) {
    const confirmed = await askConfirmation(
      "⚠️  You are about to clear PRODUCTION data.\nType CONFIRM to proceed: "
    );
    if (!confirmed) {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  // Build query
  const servicesRef = db.collection("services");
  const query = seededOnly
    ? servicesRef.where("seeded", "==", true)
    : servicesRef;

  const snap = await query.get();

  if (snap.empty) {
    console.log("No services found to delete.");
    process.exit(0);
  }

  console.log(`Deleting ${snap.size} services...\n`);

  let deleted = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    // Delete recommendations subcollection first
    const subDeleted = await deleteSubcollection(doc.ref, "recommendations");
    await doc.ref.delete();
    deleted++;
    console.log(`  - ${data.name || doc.id}${subDeleted > 0 ? ` (+ ${subDeleted} recommendations)` : ""}`);
  }

  // Optionally clear config docs (only when deleting all, not seeded-only)
  if (!seededOnly) {
    await db.doc("config/categories").delete();
    console.log("\nCleared config/categories");
    await db.doc("config/admin").delete();
    console.log("Cleared config/admin");
  }

  console.log(`\nDone! Deleted ${deleted} services.`);
  process.exit(0);
}

clear().catch((err) => {
  console.error("Clear failed:", err);
  process.exit(1);
});
