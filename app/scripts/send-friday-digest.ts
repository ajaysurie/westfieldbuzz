/**
 * Read-only preview for the Friday digest.
 *
 * Usage:
 *   npx tsx scripts/send-friday-digest.ts --dry-run
 *   npx tsx scripts/send-friday-digest.ts --dry-run --prod
 */

import { getAdminDb } from "../src/lib/server/firebase-admin";
import {
  createFirestoreDigestRepository,
  runFridayDigest,
} from "../src/lib/server/email/delivery";

const args = process.argv.slice(2);
if (!args.includes("--dry-run")) {
  console.error("Refusing to send from the CLI. Pass --dry-run for a read-only preview.");
  process.exitCode = 2;
} else {
  if (args.includes("--prod")) process.env.FIRESTORE_DB = "westfieldbuzz-prod";
  else process.env.FIRESTORE_DB ??= "westfieldbuzz-dev";

  const siteOrigin = new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://westfieldbuzz.com"
  ).origin;
  const summary = await runFridayDigest({
    repository: createFirestoreDigestRepository(getAdminDb()),
    siteOrigin,
    tokenSecret: "dry-run-token-secret",
    dryRun: true,
  });
  console.log(JSON.stringify(summary, null, 2));
}
