/**
 * Seed events from Dwell NJ "This Weekend" newsletter (March 6-8, 2026)
 * Plus nearby-area events that Westfield residents would attend
 *
 * Usage:
 *   npx tsx scripts/seed-events-newsletter.ts          # Seeds westfieldbuzz-dev
 *   npx tsx scripts/seed-events-newsletter.ts --prod   # Seeds westfieldbuzz-prod
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const isProd = process.argv.includes("--prod");
const dbName = isProd ? "westfieldbuzz-prod" : "westfieldbuzz-dev";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "westfieldbuzz",
});

const db = getFirestore(app, dbName);

const events = [
  // WESTFIELD EVENTS
  {
    title: "Devils vs. Rangers Watch Party",
    description: "Grab a drink and get ready to watch this faceoff at Lions Roar Brewing Co.",
    date: new Date("2026-03-07T15:00:00"),
    endDate: new Date("2026-03-07T18:00:00"),
    location: "Lions Roar Brewing Co., Westfield",
    category: "Sports",
  },
  {
    title: "Couples Cook a French Dinner Party",
    description: "Chef up some creamy cauliflower soup, provencal braised chicken, apple tarts and more at Cooking Thyme.",
    date: new Date("2026-03-07T16:30:00"),
    endDate: new Date("2026-03-07T19:30:00"),
    location: "Cooking Thyme, Westfield",
    category: "Food & Drink",
  },
  {
    title: "Maia Method Pop Up Event",
    description: "Celebrate International Women's Day with a pelvic floor workout and champagne toast on Quimby St.",
    date: new Date("2026-03-08T13:30:00"),
    endDate: new Date("2026-03-08T15:00:00"),
    location: "Quimby St, Westfield",
    category: "Health",
  },
  {
    title: "Apres Ski Day Party",
    description: "S'mores, hot cocoa, cider and beerskis at Lions Roar Brewing Co.",
    date: new Date("2026-03-08T14:00:00"),
    endDate: new Date("2026-03-08T17:00:00"),
    location: "Lions Roar Brewing Co., Westfield",
    category: "Food & Drink",
  },

  // NEARBY AREA EVENTS (within ~20 min of Westfield)
  {
    title: "Maple Sugar Festival",
    description: "Maple sugaring history walks, sap cooking demos, taste testing, maple cream making, games, crafts and more! Kid friendly.",
    date: new Date("2026-03-07T12:00:00"),
    endDate: new Date("2026-03-07T16:00:00"),
    location: "Great Swamp Outdoor Education Center, Chatham",
    category: "Family",
  },
  {
    title: "Swifties vs. Huntrix Karaoke Party",
    description: "Nonstop fun at this epic karaoke showdown. Kid friendly.",
    date: new Date("2026-03-07T18:00:00"),
    endDate: new Date("2026-03-07T20:00:00"),
    location: "Discoride, Berkeley Heights",
    category: "Entertainment",
  },
  {
    title: "Grateful Dead & The Beatles Tributes",
    description: "A rockin' Friday night of tribute bands at Crossroads in Garwood.",
    date: new Date("2026-03-06T19:30:00"),
    endDate: new Date("2026-03-06T23:30:00"),
    location: "Crossroads, Garwood",
    category: "Music",
  },
  {
    title: "One of One Screening and Mixer",
    description: "A curated evening for enthusiasts, collectors, builders, and those who appreciate automotive culture.",
    date: new Date("2026-03-07T19:00:00"),
    endDate: new Date("2026-03-07T21:00:00"),
    location: "The Albion, Summit",
    category: "Entertainment",
  },
  {
    title: "DJ and Pickleball Night",
    description: "A night of music, food and pickleball at Pickleball Kingdom.",
    date: new Date("2026-03-07T19:00:00"),
    endDate: new Date("2026-03-07T22:00:00"),
    location: "Pickleball Kingdom, Watchung",
    category: "Sports",
  },
  {
    title: "The Chocolate Expo",
    description: "All things chocolate at the NJ Expo Center. Kid friendly.",
    date: new Date("2026-03-07T10:00:00"),
    endDate: new Date("2026-03-07T18:00:00"),
    location: "NJ Expo Center, Edison",
    category: "Food & Drink",
  },
  {
    title: "Songs of Ireland",
    description: "Irish tenor Kevin Moulton will perform beautiful, heart-warming, tear-inducing songs of Ireland.",
    date: new Date("2026-03-08T16:00:00"),
    endDate: new Date("2026-03-08T17:30:00"),
    location: "Corpus Christi Roman Catholic Church, Chatham",
    category: "Music",
  },
  {
    title: "Riverdance 30 - The New Generation",
    description: "A global cultural sensation — a high-energy celebration of Irish music and movement at MPAC.",
    date: new Date("2026-03-06T20:00:00"),
    endDate: new Date("2026-03-06T22:00:00"),
    location: "MPAC, Morristown",
    category: "Arts",
  },
];

async function seed() {
  console.log(`Target database: ${dbName}${isProd ? " (PRODUCTION)" : ""}`);
  console.log(`Seeding ${events.length} events from Dwell NJ newsletter...\n`);

  for (const evt of events) {
    const ref = db.collection("events").doc();
    await ref.set({
      ...evt,
      interestedCount: 0,
      createdBy: "system",
      createdAt: FieldValue.serverTimestamp(),
    });
    const day = evt.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    console.log(`  + ${evt.title} (${day}) — ${evt.location}`);
  }

  console.log(`\nDone! Seeded ${events.length} events.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
