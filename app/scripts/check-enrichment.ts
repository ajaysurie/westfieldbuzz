import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = initializeApp({ credential: applicationDefault() });
const db = getFirestore(app, "westfieldbuzz-dev");

async function main() {
  const snap = await db.collection("services").get();
  const withIg = snap.docs.filter((d) => d.data().instagram).slice(0, 10);

  console.log(`\n=== Spot-checking ${withIg.length} businesses with Instagram links ===\n`);

  for (const d of withIg) {
    const data = d.data();
    console.log(`Name:      ${data.name}`);
    console.log(`Website:   ${data.website || "(none)"}`);
    console.log(`Instagram: ${data.instagram}`);
    console.log(`Facebook:  ${data.facebook || "(none)"}`);
    console.log(`Yelp:      ${data.yelp || "(none)"}`);
    console.log(`Rating:    ${data.rating || "-"}`);
    console.log("---");
  }
}

main().catch(console.error);
