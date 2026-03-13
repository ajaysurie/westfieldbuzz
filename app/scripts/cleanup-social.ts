/**
 * Clean up bad social links from enrichment.
 * Removes generic/broken Facebook and Instagram links.
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const isProd = args.includes("--prod");
const isWrite = args.includes("--write");
const dbName = isProd ? "westfieldbuzz-prod" : "westfieldbuzz-dev";

const app = initializeApp({ credential: applicationDefault() });
const db = getFirestore(app, dbName);

const BAD_PATTERNS = [
  /facebook\.com\/(profile\.php|pages|login|help|policies|privacy)$/i,
  /facebook\.com\/pages$/i,
  /instagram\.com\/(accounts|explore|p|reel|stories)$/i,
];

function isBadLink(url: string): boolean {
  return BAD_PATTERNS.some((p) => p.test(url));
}

async function main() {
  console.log(`=== Social Link Cleanup ===`);
  console.log(`Database: ${dbName}`);
  console.log(`Mode: ${isWrite ? "WRITE" : "DRY RUN"}\n`);

  const snap = await db.collection("services").get();
  let cleaned = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const updates: Record<string, unknown> = {};

    if (data.facebook && isBadLink(data.facebook)) {
      updates.facebook = FieldValue.delete();
      console.log(`[${data.name}] Removing bad Facebook: ${data.facebook}`);
    }
    if (data.instagram && isBadLink(data.instagram)) {
      updates.instagram = FieldValue.delete();
      console.log(`[${data.name}] Removing bad Instagram: ${data.instagram}`);
    }

    if (Object.keys(updates).length > 0) {
      if (isWrite) await doc.ref.update(updates);
      cleaned++;
    }
  }

  console.log(`\nCleaned: ${cleaned} businesses`);
  if (!isWrite) console.log("(Dry run — use --write to persist)");
}

main().catch(console.error);
