/**
 * Seed a small, clearly-labeled review inventory so a PR preview is judgeable.
 *
 * These are review fixtures, not ingested source data. Every document is written
 * with provenance "manual" and a manualVerification block naming the operator, and
 * no document invents a sourceUrl. Dates are relative to run time so the fixture
 * never ages out of the 30-day public window.
 *
 * Usage:
 *   npx tsx scripts/seed-review-fixtures.ts             # writes westfieldbuzz-dev
 *   npx tsx scripts/seed-review-fixtures.ts --refresh   # only bumps lastVerifiedAt
 *   npx tsx scripts/seed-review-fixtures.ts --remove    # deletes the fixtures
 *   npx tsx scripts/seed-review-fixtures.ts --prod      # requires --i-understand
 *
 * Auth: Application Default Credentials (`gcloud auth application-default login`).
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import type {
  EventAvailability,
  EventCategory,
  EventStatus,
} from "../src/lib/events/types";

const args = process.argv.slice(2);
const isProd = args.includes("--prod");
const isRefresh = args.includes("--refresh");
const isRemove = args.includes("--remove");
/** Print the documents as JSON and exit, without contacting Firestore. */
const isEmitJson = args.includes("--emit-json");

if (isProd && !args.includes("--i-understand")) {
  console.error(
    "Refusing to touch westfieldbuzz-prod without --i-understand.\n" +
      "Review fixtures belong in dev. Only pass both flags if that is genuinely intended."
  );
  process.exit(1);
}

const dbName = isProd ? "westfieldbuzz-prod" : "westfieldbuzz-dev";

/** Marks every document this script owns, so refresh/remove never touch real data. */
const FIXTURE_FLAG = "reviewFixture";
const VERIFIER = "review-fixture-seed";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "westfieldbuzz",
});
const db = getFirestore(app, dbName);

const now = new Date();

/** Day offset from now, at a given local hour. */
function at(dayOffset: number, hour: number, minute = 0): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

interface Fixture {
  slug: string;
  title: string;
  description: string;
  date: Date;
  endDate: Date | null;
  location: string;
  town: string;
  category: EventCategory;
  status: EventStatus;
  availability: EventAvailability;
}

/**
 * Deliberately spans the states a real calendar has to survive: several
 * categories, a multi-week recurring series, a cancellation, a weather hold,
 * a waitlist, a sold-out entry, and a same-day event.
 */
const fixtures: Fixture[] = [
  {
    slug: "memorial-pool-family-swim",
    title: "Family Twilight Swim",
    description:
      "Evening open swim for families at the memorial pool complex. Lifeguards on duty; children under 12 must swim with an adult.",
    date: at(0, 18),
    endDate: at(0, 20),
    location: "Westfield Memorial Pool, 1 Ferris Place",
    town: "Westfield",
    category: "Family & Kids",
    status: "scheduled",
    availability: "available",
  },
  {
    slug: "farmers-market-week-1",
    title: "Downtown Farmers Market",
    description:
      "Weekly producer-only market on the south side lot. Local growers, bakers, and prepared food vendors.",
    date: at(3, 8),
    endDate: at(3, 13),
    location: "South Avenue Train Station Lot",
    town: "Westfield",
    category: "Markets",
    status: "scheduled",
    availability: "available",
  },
  {
    slug: "farmers-market-week-2",
    title: "Downtown Farmers Market",
    description:
      "Weekly producer-only market on the south side lot. Local growers, bakers, and prepared food vendors.",
    date: at(10, 8),
    endDate: at(10, 13),
    location: "South Avenue Train Station Lot",
    town: "Westfield",
    category: "Markets",
    status: "scheduled",
    availability: "available",
  },
  {
    slug: "farmers-market-week-3",
    title: "Downtown Farmers Market",
    description:
      "Weekly producer-only market on the south side lot. Local growers, bakers, and prepared food vendors.",
    date: at(17, 8),
    endDate: at(17, 13),
    location: "South Avenue Train Station Lot",
    town: "Westfield",
    category: "Markets",
    status: "scheduled",
    availability: "available",
  },
  {
    slug: "library-toddler-storytime",
    title: "Toddler Storytime",
    description:
      "Songs, rhymes, and picture books for walkers through age three, with a caregiver. Runs about thirty minutes.",
    date: at(2, 10, 30),
    endDate: at(2, 11),
    location: "Westfield Memorial Library, 550 East Broad Street",
    town: "Westfield",
    category: "Family & Kids",
    status: "scheduled",
    availability: "registration-required",
  },
  {
    slug: "community-band-concert",
    title: "Community Band Summer Concert",
    description:
      "Outdoor concert on the park bandstand. Bring a blanket or a folding chair. Moves indoors if it rains.",
    date: at(5, 19, 30),
    endDate: at(5, 21),
    location: "Mindowaskin Park Bandstand",
    town: "Westfield",
    category: "Music",
    status: "weather-dependent",
    availability: "available",
  },
  {
    slug: "restaurant-week-kickoff",
    title: "Restaurant Week Kickoff Tasting",
    description:
      "Walk-around tasting with participating downtown kitchens. Ticketed; proceeds support the downtown corporation.",
    date: at(8, 18),
    endDate: at(8, 21),
    location: "North Avenue Plaza",
    town: "Westfield",
    category: "Food & Drink",
    status: "scheduled",
    availability: "sold-out",
  },
  {
    slug: "art-association-opening",
    title: "Art Association Members Opening",
    description:
      "Opening reception for the summer members exhibition. Light refreshments; the show hangs through the following month.",
    date: at(6, 18, 30),
    endDate: at(6, 20, 30),
    location: "Community Room, 425 East Broad Street",
    town: "Westfield",
    category: "Arts & Culture",
    status: "scheduled",
    availability: "available",
  },
  {
    slug: "5k-fun-run",
    title: "Labor Day 5K and Fun Run",
    description:
      "Chip-timed 5K followed by a untimed kids fun run. Race-day registration opens ninety minutes before the start.",
    date: at(14, 8, 30),
    endDate: at(14, 11),
    location: "Start: Elm Street at North Avenue",
    town: "Westfield",
    category: "Sports & Recreation",
    status: "scheduled",
    availability: "waitlist",
  },
  {
    slug: "historical-society-walking-tour",
    title: "Historic District Walking Tour",
    description:
      "Ninety-minute guided walk covering the town's nineteenth-century commercial buildings. Comfortable shoes recommended.",
    date: at(9, 14),
    endDate: at(9, 15, 30),
    location: "Meet at the Town Green flagpole",
    town: "Westfield",
    category: "History",
    status: "scheduled",
    availability: "registration-required",
  },
  {
    slug: "blood-drive",
    title: "Community Blood Drive",
    description:
      "Appointments preferred, walk-ins accepted as capacity allows. Bring photo identification.",
    date: at(12, 12),
    endDate: at(12, 18),
    location: "Westfield Community Center",
    town: "Westfield",
    category: "Health & Wellness",
    status: "scheduled",
    availability: "registration-required",
  },
  {
    slug: "outdoor-movie-night",
    title: "Movie Night on the Green",
    description:
      "Family film screened after sunset. This date was cancelled by the organizer; a make-up date has not been announced.",
    date: at(4, 20),
    endDate: at(4, 22),
    location: "Town Green",
    town: "Westfield",
    category: "Entertainment",
    status: "cancelled",
    availability: "unknown",
  },
  {
    slug: "neighborhood-cleanup",
    title: "Brook Cleanup Volunteer Morning",
    description:
      "Volunteer litter pickup along the brook corridor. Gloves and bags provided; meet at the parking area.",
    date: at(20, 9),
    endDate: at(20, 12),
    location: "Brightwood Park parking area",
    town: "Westfield",
    category: "Community",
    status: "scheduled",
    availability: "available",
  },
];

function docId(slug: string): string {
  return `review-fixture-${slug}`;
}

async function removeFixtures(): Promise<void> {
  const snap = await db.collection("events").where(FIXTURE_FLAG, "==", true).get();
  if (snap.empty) {
    console.log("No review fixtures found. Nothing to remove.");
    return;
  }
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  console.log(`Removed ${snap.size} review fixtures from ${dbName}.`);
}

async function refreshFixtures(): Promise<void> {
  const snap = await db.collection("events").where(FIXTURE_FLAG, "==", true).get();
  if (snap.empty) {
    console.log("No review fixtures found. Run without --refresh to seed them first.");
    return;
  }
  const verifiedAt = Timestamp.fromDate(now);
  const batch = db.batch();
  snap.docs.forEach((d) =>
    batch.update(d.ref, {
      lastVerifiedAt: verifiedAt,
      lastSeenAt: verifiedAt,
      freshnessStatus: "current",
      "manualVerification.verifiedAt": verifiedAt,
    })
  );
  await batch.commit();
  console.log(
    `Refreshed lastVerifiedAt on ${snap.size} review fixtures in ${dbName}. ` +
      "They stay publicly visible for the next 36 hours."
  );
}

/** Pure: the exact document body written for one fixture. */
function buildDoc(fixture: Fixture, verifiedAt: Date): Record<string, unknown> {
  return {
    title: fixture.title,
    description: fixture.description,
    date: fixture.date,
    endDate: fixture.endDate,
    location: fixture.location,
    town: fixture.town,
    category: fixture.category,
    status: fixture.status,
    availability: fixture.availability,

    // Public read contract: published + current + verified inside 36 hours.
    publicationStatus: "published",
    freshnessStatus: "current",
    lastVerifiedAt: verifiedAt,
    lastSeenAt: verifiedAt,
    missingSince: null,
    missingRunCount: 0,

    // Manual provenance. No sourceUrl is invented for a hand-written record.
    provenance: "manual",
    manualVerification: { verifier: VERIFIER, verifiedAt },

    interestedCount: 0,
    createdBy: VERIFIER,
    createdAt: verifiedAt,

    [FIXTURE_FLAG]: true,
  };
}

/** Emit documents as JSON for an out-of-process writer. Touches no credentials. */
function emitJson(): void {
  const verifiedAt = now;
  const payload = fixtures.map((f) => ({
    id: docId(f.slug),
    doc: buildDoc(f, verifiedAt),
  }));
  // Date.prototype.toJSON runs before a replacer sees the value, so read the
  // pre-serialization value off the holder to detect real Dates.
  process.stdout.write(
    JSON.stringify(payload, function (this: Record<string, unknown>, key, value) {
      const original = this[key];
      return original instanceof Date ? { __ts: original.toISOString() } : value;
    })
  );
}

async function seedFixtures(): Promise<void> {
  const verifiedAt = Timestamp.fromDate(now);
  const batch = db.batch();

  for (const fixture of fixtures) {
    const raw = buildDoc(fixture, now);
    // Re-encode Date values as Firestore Timestamps for the Admin SDK path.
    const encoded: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v instanceof Date) encoded[k] = Timestamp.fromDate(v);
      else if (k === "manualVerification") encoded[k] = { verifier: VERIFIER, verifiedAt };
      else encoded[k] = v;
    }
    batch.set(db.collection("events").doc(docId(fixture.slug)), encoded);
  }

  await batch.commit();
  console.log(`Seeded ${fixtures.length} review fixtures into ${dbName}.`);
  console.log(
    "These carry reviewFixture: true and provenance: manual. " +
      "Remove them with --remove before this database is treated as real."
  );
  console.log(
    "Public visibility expires 36 hours after seeding " +
      "(MAX_PUBLIC_VERIFICATION_AGE_HOURS). Re-run with --refresh to extend."
  );
}

(async () => {
  if (isEmitJson) { emitJson(); process.exit(0); }
  console.log(`Target database: ${dbName}${isProd ? " (PRODUCTION)" : ""}`);
  if (isRemove) await removeFixtures();
  else if (isRefresh) await refreshFixtures();
  else await seedFixtures();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
