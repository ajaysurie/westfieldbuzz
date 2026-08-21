import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { MAX_PUBLIC_VERIFICATION_AGE_HOURS } from "../../events/freshness";

export interface FreshnessWatchdogSummary {
  status: "success" | "partial";
  overdueSources: number;
  staleEvents: number;
  warnings: string[];
}

function asDate(value: unknown): Date | null {
  return value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function"
    ? value.toDate() : value instanceof Date ? value : null;
}

/**
 * Independent of the crawler itself: overdue runs and old event verification
 * become durable, operator-visible state even if a cron invocation vanishes.
 */
export async function runFreshnessWatchdog(input: { db: Firestore; now?: Date }): Promise<FreshnessWatchdogSummary> {
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - MAX_PUBLIC_VERIFICATION_AGE_HOURS * 60 * 60 * 1000);
  const warnings: string[] = [];
  let overdueSources = 0;
  let staleEvents = 0;
  try {
    const health = await input.db.collection("eventSourceHealth").get();
    await Promise.all(health.docs.map(async (source) => {
      const nextExpected = asDate(source.data().nextExpectedRunAt);
      if (!nextExpected || nextExpected > now) return;
      overdueSources += 1;
      await source.ref.set({
        alertState: "overdue",
        alertOpenedAt: FieldValue.serverTimestamp(),
        alertUpdatedAt: FieldValue.serverTimestamp(),
        alertReason: "next-expected-run-overdue",
      }, { merge: true });
    }));
  } catch (error) {
    warnings.push(`Source watchdog failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const events = await input.db.collection("events")
      .where("publicationStatus", "==", "published")
      .where("lastVerifiedAt", "<", Timestamp.fromDate(cutoff))
      .limit(250)
      .get();
    for (const event of events.docs) {
      await event.ref.set({
        freshnessStatus: "stale",
        staleAt: FieldValue.serverTimestamp(),
        staleReason: "maximum-verification-age-exceeded",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      staleEvents += 1;
    }
  } catch (error) {
    warnings.push(`Event freshness watchdog failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { status: warnings.length ? "partial" : "success", overdueSources, staleEvents, warnings };
}
