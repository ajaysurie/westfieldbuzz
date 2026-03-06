/**
 * Seed script: Load sample businesses into Firestore using Admin SDK (bypasses rules)
 *
 * Usage:
 *   npx tsx scripts/seed.ts          # Seeds the "westfieldbuzz-dev" database
 *   npx tsx scripts/seed.ts --prod   # Seeds the "westfieldbuzz-prod" database
 *
 * Auth: Uses Application Default Credentials (run `firebase login` first)
 */

import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import businesses from "../src/data/scraped-businesses.json";

const isProd = process.argv.includes("--prod");
const dbName = isProd ? "westfieldbuzz-prod" : "westfieldbuzz-dev";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "westfieldbuzz",
});

const db = getFirestore(app, dbName);

async function seed() {
  console.log(`Target database: ${dbName}${isProd ? " (PRODUCTION)" : ""}`);
  console.log(`Seeding ${businesses.length} businesses...\n`);

  const categories = new Set<string>();

  for (const biz of businesses) {
    const ref = db.collection("services").doc();
    await ref.set({
      name: biz.name,
      category: biz.category,
      phone: biz.phone,
      email: biz.email,
      address: biz.address,
      website: biz.website,
      recommendations: biz.recommendations,
      recentRecommenders: (biz as any).recommendedBy || [],
      lastRecommended: null,
      seeded: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    categories.add(biz.category);
    console.log(`  + ${biz.name} (${biz.category})`);
  }

  // Seed categories config
  const categoryList = Array.from(categories).sort();
  await db.doc("config/categories").set({ list: categoryList });
  console.log(`\nCategories: ${categoryList.join(", ")}`);

  // Seed admin config
  await db.doc("config/admin").set({
    allowlist: ["ajay.surie@gmail.com"],
  });
  console.log("Admin allowlist set");

  console.log(`\nDone! Seeded ${businesses.length} businesses.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
