import type { Firestore } from "firebase-admin/firestore";

export interface EventHardDeleteDependencies {
  sourceEvidence: number;
  savedEvents: number;
  fingerprintClaim: boolean;
}

/** Deliberately narrow maintenance-only escape hatch; normal admin removal is suppression. */
export function canHardDeleteEvent(dependencies: EventHardDeleteDependencies): boolean {
  return dependencies.sourceEvidence === 0 && dependencies.savedEvents === 0;
}

export async function hardDeleteEventForMaintenance(input: {
  db: Firestore;
  eventId: string;
  confirmMaintenance: true;
}): Promise<void> {
  if (input.confirmMaintenance !== true) throw new Error("maintenance-confirmation-required");
  const eventRef = input.db.collection("events").doc(input.eventId);
  await input.db.runTransaction(async (transaction) => {
    const event = await transaction.get(eventRef);
    if (!event.exists) return;
    const data = event.data() ?? {};
    const [sources, saves, registry] = await Promise.all([
      transaction.get(input.db.collection("eventSources").where("eventId", "==", input.eventId)),
      transaction.get(input.db.collectionGroup("savedEvents").where("eventId", "==", input.eventId)),
      typeof data.identityFingerprint === "string"
        ? transaction.get(input.db.collection("eventFingerprintRegistry").doc(data.identityFingerprint))
        : Promise.resolve(null),
    ]);
    const dependencies = { sourceEvidence: sources.size, savedEvents: saves.size, fingerprintClaim: Boolean(registry?.exists) };
    if (!canHardDeleteEvent(dependencies)) throw new Error("hard-delete-refused-dependent-records");
    transaction.delete(eventRef);
    if (registry?.exists && registry.data()?.eventId === input.eventId) transaction.delete(registry.ref);
  });
}
