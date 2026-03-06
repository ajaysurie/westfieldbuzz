/**
 * Seed events into Firestore
 *
 * Usage:
 *   npx tsx scripts/seed-events.ts          # Seeds westfieldbuzz-dev
 *   npx tsx scripts/seed-events.ts --prod   # Seeds westfieldbuzz-prod
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
  {
    title: "WPD Easter Egg Hunt",
    description: "Annual Easter egg hunt hosted by the Westfield Police Department. Fun for kids of all ages!",
    date: new Date("2026-03-22T10:00:00"),
    endDate: new Date("2026-03-22T12:00:00"),
    location: "Mindowaskin Park, Westfield",
    category: "Family",
  },
  {
    title: "Lifelong Westfield: Monthly Lunch Club",
    description: "Monthly social lunch for Westfield seniors. Meet neighbors and enjoy good conversation.",
    date: new Date("2026-03-24T12:00:00"),
    endDate: new Date("2026-03-24T14:00:00"),
    location: "Westfield Community Center",
    category: "Community",
  },
  {
    title: "Westfield Community Players: The Diary of Anne Frank",
    description: "A powerful stage adaptation of Anne Frank's diary, performed by the Westfield Community Players.",
    date: new Date("2026-03-20T20:00:00"),
    endDate: new Date("2026-03-21T22:00:00"),
    location: "1000 North Avenue West",
    category: "Arts",
  },
  {
    title: "Where Liberty Lived: Westfield's Revolutionary-Era Homes",
    description: "Historical talk exploring Westfield's homes and landmarks from the Revolutionary War era.",
    date: new Date("2026-04-09T19:00:00"),
    endDate: new Date("2026-04-09T21:00:00"),
    location: "Westfield Historical Society, 314 Mountain Ave",
    category: "History",
  },
  {
    title: "Green Team Free Market",
    description: "Bring items you no longer need and take what you can use — free! Reduce waste and help the community.",
    date: new Date("2026-04-25T09:00:00"),
    endDate: new Date("2026-04-25T12:00:00"),
    location: "Downtown Westfield",
    category: "Community",
  },
  {
    title: "Spring Into Fitness on Quimby",
    description: "Outdoor fitness classes and wellness activities on Quimby Street. All fitness levels welcome.",
    date: new Date("2026-04-25T10:00:00"),
    endDate: new Date("2026-04-25T13:00:00"),
    location: "Quimby Street, Downtown Westfield",
    category: "Health",
  },
  {
    title: "Westfield Farmers Market Opening Day",
    description: "The beloved Westfield Farmers Market returns for the season! Fresh produce, baked goods, and local vendors.",
    date: new Date("2026-05-02T09:00:00"),
    endDate: new Date("2026-05-02T14:00:00"),
    location: "South Avenue Train Station Parking Lot",
    category: "Market",
  },
  {
    title: "Downtown Westfield 5K Run",
    description: "Annual 5K run through the streets of downtown Westfield. Proceeds benefit local charities.",
    date: new Date("2026-04-18T08:00:00"),
    endDate: new Date("2026-04-18T11:00:00"),
    location: "Downtown Westfield",
    category: "Sports",
  },
  {
    title: "Westfield Memorial Library: 50th Used Book Sale",
    description: "The Friends of the Westfield Memorial Library host their 50th annual used book sale. Thousands of books at great prices.",
    date: new Date("2026-04-30T10:00:00"),
    endDate: new Date("2026-05-04T16:00:00"),
    location: "Westfield Memorial Library, 550 E Broad St",
    category: "Community",
  },
  {
    title: "Westfield Concert Band: Dancing into Spring",
    description: "The Westfield Community Concert Band performs a lively spring concert. Free admission.",
    date: new Date("2026-04-04T19:30:00"),
    endDate: new Date("2026-04-04T21:00:00"),
    location: "Edison Intermediate School, 800 Rahway Ave",
    category: "Arts",
  },
];

async function seed() {
  console.log(`Target database: ${dbName}${isProd ? " (PRODUCTION)" : ""}`);
  console.log(`Seeding ${events.length} events...\n`);

  for (const evt of events) {
    const ref = db.collection("events").doc();
    await ref.set({
      ...evt,
      interestedCount: 0,
      createdBy: "system",
      createdAt: FieldValue.serverTimestamp(),
    });
    console.log(`  + ${evt.title} (${evt.date.toLocaleDateString()})`);
  }

  console.log(`\nDone! Seeded ${events.length} events.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
