/** Monthly bounded discovery. JSON output only unless --write is explicit. */
import { currentDatabaseName, serverFirestore } from "../src/lib/server/ingestion/firebase-admin";
import { runDiscovery } from "../src/lib/server/ingestion/discovery";

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const prod = args.includes("--prod");
  if (prod && !write) throw new Error("--prod is only valid with --write");
  const database = prod ? "westfieldbuzz-prod" : currentDatabaseName();
  const result = await runDiscovery({
    db: serverFirestore(database),
    write,
  });
  console.log(JSON.stringify({ mode: write ? "write" : "dry-run", ...result }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
