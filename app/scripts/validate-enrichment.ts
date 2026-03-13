/**
 * Validate Enrichment Data
 *
 * Re-checks enriched businesses against Google Places to ensure the
 * Maps URL, social links, etc. actually belong to the right business.
 * Strips enrichment from any business where Google returns a different name.
 *
 * Usage:
 *   npx tsx scripts/validate-enrichment.ts                    # Dry run on dev
 *   npx tsx scripts/validate-enrichment.ts --write            # Fix dev
 *   npx tsx scripts/validate-enrichment.ts --write --prod     # Fix prod
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const isProd = args.includes("--prod");
const isWrite = args.includes("--write");
const dbName = isProd ? "westfieldbuzz-prod" : "westfieldbuzz-dev";

const PLACES_API_KEY = process.env.PLACES_API_KEY;
if (!PLACES_API_KEY) {
  console.error("Missing PLACES_API_KEY env var");
  process.exit(1);
}

const app = initializeApp({ credential: applicationDefault() });
const db = getFirestore(app, dbName);

/** Normalize a name for comparison */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(llc|inc|corp|ltd|co|dba|pllc|pc|dmd|md|do|dds|esq)\b/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Check if two business names are similar enough */
function namesMatch(ourName: string, googleName: string): boolean {
  const a = normalizeName(ourName);
  const b = normalizeName(googleName);

  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  const wordsA = new Set(a.split(" ").filter((w) => w.length > 2));
  const wordsB = new Set(b.split(" ").filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return false;

  let matches = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) matches++;
  }

  const minWords = Math.min(wordsA.size, wordsB.size);
  return matches >= Math.ceil(minWords * 0.5);
}

/** Look up a business on Google Places and return the display name */
async function getGoogleName(name: string, address: string): Promise<string | null> {
  const query = address ? `${name} ${address}` : `${name} Westfield NJ`;

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": PLACES_API_KEY,
      "X-Goog-FieldMask": "places.displayName",
    },
    body: JSON.stringify({ textQuery: query }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.places?.[0]?.displayName?.text || null;
}

async function main() {
  console.log(`=== Enrichment Validation ===`);
  console.log(`Database: ${dbName}`);
  console.log(`Mode: ${isWrite ? "WRITE" : "DRY RUN"}\n`);

  const snap = await db.collection("services").get();

  // Only check businesses that have enrichment data
  const enriched = snap.docs.filter((d) => {
    const data = d.data();
    return data.googleMapsUrl || data.instagram || data.facebook || data.yelp;
  });

  console.log(`Checking ${enriched.length} enriched businesses...\n`);

  let valid = 0;
  let invalid = 0;
  let errors = 0;

  for (let i = 0; i < enriched.length; i++) {
    const doc = enriched[i];
    const data = doc.data();
    const name = data.name as string;
    const address = (data.address as string) || "";

    process.stdout.write(`[${i + 1}/${enriched.length}] ${name}... `);

    const googleName = await getGoogleName(name, address);
    if (!googleName) {
      console.log("not found on Google — stripping enrichment");
      if (isWrite) {
        await doc.ref.update({
          googleMapsUrl: FieldValue.delete(),
          instagram: FieldValue.delete(),
          facebook: FieldValue.delete(),
          yelp: FieldValue.delete(),
          rating: FieldValue.delete(),
          ratingCount: FieldValue.delete(),
        });
      }
      invalid++;
      await new Promise((r) => setTimeout(r, 200));
      continue;
    }

    if (namesMatch(name, googleName)) {
      console.log(`OK ("${googleName}")`);
      valid++;
    } else {
      console.log(`MISMATCH: "${googleName}" — stripping enrichment`);
      if (isWrite) {
        await doc.ref.update({
          googleMapsUrl: FieldValue.delete(),
          instagram: FieldValue.delete(),
          facebook: FieldValue.delete(),
          yelp: FieldValue.delete(),
          rating: FieldValue.delete(),
          ratingCount: FieldValue.delete(),
        });
      }
      invalid++;
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Valid:   ${valid}`);
  console.log(`  Invalid: ${invalid}`);
  if (!isWrite && invalid > 0) {
    console.log(`\n  (Dry run — use --write to strip invalid enrichment)`);
  }
}

main().catch(console.error);
