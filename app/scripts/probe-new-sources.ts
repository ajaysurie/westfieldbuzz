/**
 * Runs fetchSourceEvents against the new venue sources to prove the fetch
 * half end to end. Without GEMINI_API_KEY the extractor skips cleanly, so
 * instagram/llm-extract results show fetched text + errors but no events —
 * that still proves captions and pages flow through the real adapters.
 *
 *   npx tsx scripts/probe-new-sources.ts
 */
import { sourceById } from "../src/lib/server/ingestion/source-registry";
import { fetchSourceEvents } from "../src/lib/server/ingestion/adapters";

const IDS = [
  "bull-n-bear-events",
  "deutscher-club-instagram",
  "tomasello-cranford-instagram",
  "james-ward-instagram",
  "fire-me-up-instagram",
  "wet-ticket-llm-search",
  "felina-summit-llm-search",
];

async function main() {
  const from = new Date();
  const to = new Date(from.getTime() + 30 * 86_400_000);
  const window = {
    fromLocalDate: from.toISOString().slice(0, 10),
    toLocalDate: to.toISOString().slice(0, 10),
  };
  for (const id of IDS) {
    const source = sourceById(id);
    if (!source) {
      console.log(`${id}: NOT REGISTERED`);
      continue;
    }
    try {
      const result = await fetchSourceEvents({ source, window });
      console.log(
        `${id}: events=${result.events.length} complete=${result.complete} ` +
          `bytes=${result.responseBytes} errors=${JSON.stringify(result.errors.slice(0, 2))}`
      );
      for (const event of result.events.slice(0, 4)) {
        console.log(`  - ${event.title} @ ${event.date.toISOString().slice(0, 10)}`);
      }
    } catch (error) {
      console.log(`${id}: THREW ${error instanceof Error ? error.message : error}`);
    }
  }
}

main();
