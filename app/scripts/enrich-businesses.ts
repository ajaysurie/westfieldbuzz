/**
 * Business Enrichment Script
 *
 * Uses Google Places API (New) to enrich business listings with:
 * - Google Maps URL (direct link)
 * - Verified website, phone
 * - Rating and review count
 * - Business status (open/closed)
 *
 * Then scrapes business websites for social links (Instagram, Facebook, Yelp).
 *
 * Usage:
 *   npx tsx scripts/enrich-businesses.ts                    # Dry run against dev
 *   npx tsx scripts/enrich-businesses.ts --write            # Write to dev
 *   npx tsx scripts/enrich-businesses.ts --write --prod     # Write to prod
 *   npx tsx scripts/enrich-businesses.ts --limit 10         # Process only 10 businesses
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

const limit = parseInt(getArgValue("--limit") || "0", 10);

const PLACES_API_KEY = process.env.PLACES_API_KEY;
if (!PLACES_API_KEY) {
  console.error("Missing PLACES_API_KEY env var");
  process.exit(1);
}

// ===== Firebase Admin =====

const app = initializeApp({
  credential: applicationDefault(),
});
const db = getFirestore(app, dbName);

// ===== Types =====

interface EnrichedData {
  googleMapsUrl?: string;
  googleMapsDirectionsUrl?: string;
  websiteFromGoogle?: string;
  phoneFromGoogle?: string;
  rating?: number;
  ratingCount?: number;
  businessStatus?: string;
  instagram?: string;
  facebook?: string;
  yelp?: string;
}

// ===== Name Matching =====

/** Normalize a name for comparison: lowercase, strip common suffixes, non-alpha chars */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(llc|inc|corp|ltd|co|dba|pllc|pc|dmd|md|do|dds|esq)\b/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Check if two business names are similar enough to be the same business */
function namesMatch(ourName: string, googleName: string): boolean {
  const a = normalizeName(ourName);
  const b = normalizeName(googleName);

  // Exact match after normalization
  if (a === b) return true;

  // One contains the other
  if (a.includes(b) || b.includes(a)) return true;

  // Check if most words overlap (handles "Dr. Smith" vs "Smith Family Dentistry")
  const wordsA = new Set(a.split(" ").filter((w) => w.length > 2));
  const wordsB = new Set(b.split(" ").filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return false;

  let matches = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) matches++;
  }

  // At least half the words from the shorter name must appear in the longer
  const minWords = Math.min(wordsA.size, wordsB.size);
  return matches >= Math.ceil(minWords * 0.5);
}

// ===== Google Places API (New) =====

async function searchPlace(name: string, address: string): Promise<EnrichedData | null> {
  const query = address ? `${name} ${address}` : `${name} Westfield NJ`;

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": PLACES_API_KEY,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.googleMapsUri",
        "places.googleMapsLinks",
        "places.websiteUri",
        "places.nationalPhoneNumber",
        "places.rating",
        "places.userRatingCount",
        "places.businessStatus",
      ].join(","),
    },
    body: JSON.stringify({ textQuery: query }),
  });

  if (!res.ok) {
    console.error(`  Places API error: ${res.status} ${res.statusText}`);
    const body = await res.text();
    console.error(`  ${body.slice(0, 200)}`);
    return null;
  }

  const data = await res.json();
  const place = data.places?.[0];
  if (!place) return null;

  // Validate name match — skip if Google returned a different business
  const googleName = place.displayName?.text || "";
  if (!namesMatch(name, googleName)) {
    console.log(`name mismatch: "${name}" vs Google's "${googleName}" — skipping`);
    return null;
  }

  return {
    googleMapsUrl: place.googleMapsLinks?.placeUri || place.googleMapsUri || undefined,
    googleMapsDirectionsUrl: place.googleMapsLinks?.directionsUri || undefined,
    websiteFromGoogle: place.websiteUri || undefined,
    phoneFromGoogle: place.nationalPhoneNumber || undefined,
    rating: place.rating || undefined,
    ratingCount: place.userRatingCount || undefined,
    businessStatus: place.businessStatus || undefined,
  };
}

// ===== Social Link Scraping =====

const SOCIAL_PATTERNS = {
  instagram: /https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9_.]+\/?/gi,
  facebook: /https?:\/\/(www\.)?(facebook|fb)\.com\/[a-zA-Z0-9_.]+\/?/gi,
  yelp: /https?:\/\/(www\.)?yelp\.com\/biz\/[a-zA-Z0-9_-]+\/?/gi,
};

async function scrapeSocialLinks(websiteUrl: string): Promise<Pick<EnrichedData, "instagram" | "facebook" | "yelp">> {
  const result: Pick<EnrichedData, "instagram" | "facebook" | "yelp"> = {};

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(websiteUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WestfieldBuzz/1.0)",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) return result;

    const html = await res.text();

    for (const [platform, pattern] of Object.entries(SOCIAL_PATTERNS)) {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        // Take the first unique match, skip generic share links
        const link = matches.find(
          (m) =>
            !m.includes("/sharer") &&
            !m.includes("/share") &&
            !m.includes("/intent") &&
            !m.includes("/dialog") &&
            // Filter generic/broken Facebook links
            !m.match(/facebook\.com\/(profile\.php|pages|login|help|policies|privacy)$/i) &&
            // Filter generic Instagram links
            !m.match(/instagram\.com\/(accounts|explore|p|reel|stories)$/i)
        );
        if (link) {
          (result as Record<string, string>)[platform] = link.replace(/\/$/, "");
        }
      }
    }
  } catch {
    // Timeout or network error — skip silently
  }

  return result;
}

// ===== Main =====

async function main() {
  console.log(`=== WestfieldBuzz Business Enrichment ===`);
  console.log(`Database: ${dbName}`);
  console.log(`Mode: ${isWrite ? "WRITE" : "DRY RUN (use --write to persist)"}`);
  if (limit > 0) console.log(`Limit: ${limit} businesses`);
  console.log();

  // Fetch all services
  const snap = await db.collection("services").get();
  let services = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`Found ${services.length} businesses in Firestore`);

  if (limit > 0) services = services.slice(0, limit);

  let enriched = 0;
  let socialFound = 0;
  let errors = 0;
  let skipped = 0;

  for (let i = 0; i < services.length; i++) {
    const svc = services[i] as Record<string, unknown>;
    const name = svc.name as string;
    const address = (svc.address as string) || "";
    const existingWebsite = (svc.website as string) || "";

    process.stdout.write(`[${i + 1}/${services.length}] ${name}... `);

    // Skip if already enriched
    if (svc.googleMapsUrl) {
      console.log("already enriched, skipping");
      skipped++;
      continue;
    }

    // Step 1: Google Places lookup
    const placeData = await searchPlace(name, address);
    if (!placeData) {
      console.log("not found on Google Maps");
      errors++;
      continue;
    }

    // Step 2: Scrape website for social links
    const website = existingWebsite || placeData.websiteFromGoogle || "";
    let socialLinks: Pick<EnrichedData, "instagram" | "facebook" | "yelp"> = {};
    if (website) {
      socialLinks = await scrapeSocialLinks(website);
    }

    const hasSocial = socialLinks.instagram || socialLinks.facebook || socialLinks.yelp;
    if (hasSocial) socialFound++;

    // Build update object
    const update: Record<string, unknown> = {};
    if (placeData.googleMapsUrl) update.googleMapsUrl = placeData.googleMapsUrl;
    if (placeData.rating) update.rating = placeData.rating;
    if (placeData.ratingCount) update.ratingCount = placeData.ratingCount;
    if (placeData.websiteFromGoogle && !existingWebsite) update.website = placeData.websiteFromGoogle;
    if (placeData.phoneFromGoogle && !svc.phone) update.phone = placeData.phoneFromGoogle;
    if (socialLinks.instagram) update.instagram = socialLinks.instagram;
    if (socialLinks.facebook) update.facebook = socialLinks.facebook;
    if (socialLinks.yelp) update.yelp = socialLinks.yelp;

    if (Object.keys(update).length === 0) {
      console.log("no new data");
      continue;
    }

    console.log(
      `found: maps=${!!placeData.googleMapsUrl} rating=${placeData.rating || "-"} ` +
      `ig=${!!socialLinks.instagram} fb=${!!socialLinks.facebook} yelp=${!!socialLinks.yelp}`
    );

    if (isWrite) {
      await db.collection("services").doc(svc.id as string).update(update);
    }

    enriched++;

    // Rate limit: ~5 req/sec to be safe
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log();
  console.log(`=== Summary ===`);
  console.log(`  Total businesses: ${services.length}`);
  console.log(`  Enriched:         ${enriched}`);
  console.log(`  Social links:     ${socialFound}`);
  console.log(`  Already done:     ${skipped}`);
  console.log(`  Not found:        ${errors}`);
  if (!isWrite) {
    console.log();
    console.log(`  (Dry run — no changes written. Use --write to persist.)`);
  }
}

main().catch(console.error);
