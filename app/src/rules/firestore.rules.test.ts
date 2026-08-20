import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

const RULES_PATH = resolve(process.cwd(), "firestore.rules");
const POLICIES = ["westfieldbuzz-dev", "westfieldbuzz-prod"] as const;
const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

async function seed(testEnv: RulesTestEnvironment) {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc("config/admin").set({ allowlist: ["operator@example.com"] });
    await db.doc("events/published").set({ publicationStatus: "published", title: "Public event" });
    await db.doc("events/draft").set({ publicationStatus: "draft", title: "Draft event" });
    await Promise.all([
      db.doc("eventSourceHealth/source-a").set({ sourceId: "source-a" }),
      db.doc("sourceCandidates/source-a").set({ reviewStatus: "pending" }),
      db.doc("eventCandidates/candidate-a").set({ reviewStatus: "pending" }),
      db.doc("eventFingerprintRegistry/hash-a").set({ eventId: "published" }),
      db.doc("subscribers/subscriber-a").set({ email: "reader@example.com" }),
      db.doc("digestEditions/edition-a").set({}),
      db.doc("digestDeliveries/delivery-a").set({}),
      db.doc("confirmationDeliveries/confirmation-a").set({}),
      db.doc("rateLimits/limit-a").set({}),
      db.doc("automationLeases/lease-a").set({ owner: "server" }),
      db.doc("users/alice").set({ displayName: "Alice" }),
    ]);
  });
}

describeWithEmulator.each(POLICIES)("Firestore policy: %s", (projectId) => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: {
        host: "127.0.0.1",
        port: 8080,
        rules: await readFile(RULES_PATH, "utf8"),
      },
    });
  });

  beforeEach(async () => {
    await seed(testEnv);
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it("allows the public only to read and list published events", async () => {
    const publicDb = testEnv.unauthenticatedContext().firestore();

    await assertSucceeds(publicDb.doc("events/published").get());
    await assertSucceeds(publicDb.collection("events").where("publicationStatus", "==", "published").get());
    await assertFails(publicDb.doc("events/draft").get());
    await assertFails(publicDb.collection("events").get());
  });

  it("permits only the owner to CRUD saved events and saved searches", async () => {
    const owner = testEnv.authenticatedContext("alice", { email: "alice@example.com" }).firestore();
    const other = testEnv.authenticatedContext("bob", { email: "bob@example.com" }).firestore();
    const anonymous = testEnv.unauthenticatedContext().firestore();

    for (const collection of ["savedEvents", "savedSearches"]) {
      const ownerRef = owner.doc(`users/alice/${collection}/saved-a`);
      await assertSucceeds(ownerRef.set({ label: "Saved" }));
      await assertSucceeds(ownerRef.update({ label: "Updated" }));
      await assertSucceeds(ownerRef.delete());
      await assertFails(other.doc(`users/alice/${collection}/saved-a`).set({ label: "Nope" }));
      await assertFails(anonymous.doc(`users/alice/${collection}/saved-a`).set({ label: "Nope" }));
    }
  });

  it("does not allow a client to create or alter server subscriber linkage fields", async () => {
    const owner = testEnv.authenticatedContext("alice", { email: "alice@example.com" }).firestore();
    const newUser = testEnv.authenticatedContext("new-user", { email: "new@example.com" }).firestore();

    await assertSucceeds(owner.doc("users/alice").set({
      displayName: "Alice", email: "alice@example.com", preferences: {}, preferenceSchemaVersion: 1,
    }));
    await assertFails(newUser.doc("users/new-user").set({
      displayName: "New user", subscriberId: "subscriber-a",
    }));
    await assertFails(owner.doc("users/alice").update({ subscriberId: "subscriber-a" }));
  });

  it("keeps health, candidates, and registry data to admins", async () => {
    const publicDb = testEnv.unauthenticatedContext().firestore();
    const reader = testEnv.authenticatedContext("reader", { email: "reader@example.com" }).firestore();
    const admin = testEnv.authenticatedContext("operator", { email: "operator@example.com", email_verified: true }).firestore();
    const unverifiedAllowlisted = testEnv.authenticatedContext("operator-unverified", { email: "operator@example.com", email_verified: false }).firestore();
    const collections = ["eventSourceHealth", "sourceCandidates", "eventCandidates", "eventFingerprintRegistry"];

    for (const collection of collections) {
      await assertFails(publicDb.collection(collection).get());
      await assertFails(reader.collection(collection).get());
      await assertSucceeds(admin.collection(collection).get());
      await assertSucceeds(admin.doc(`${collection}/admin-write`).set({ operator: true }));
      await assertFails(unverifiedAllowlisted.collection(collection).get());
    }
  });

  it("keeps subscriber, delivery, and rate-limit records to admins", async () => {
    const publicDb = testEnv.unauthenticatedContext().firestore();
    const reader = testEnv.authenticatedContext("reader", { email: "reader@example.com" }).firestore();
    const admin = testEnv.authenticatedContext("operator", { email: "operator@example.com", email_verified: true }).firestore();
    const collections = ["subscribers", "digestEditions", "digestDeliveries", "digestRuns", "confirmationDeliveries", "rateLimits"];

    for (const collection of collections) {
      await assertFails(publicDb.collection(collection).get());
      await assertFails(reader.collection(collection).get());
      await assertSucceeds(admin.collection(collection).get());
    }
  });

  it("never gives browser clients an automation lease", async () => {
    const publicDb = testEnv.unauthenticatedContext().firestore();
    const admin = testEnv.authenticatedContext("operator", { email: "operator@example.com", email_verified: true }).firestore();

    await assertFails(publicDb.doc("automationLeases/lease-a").get());
    await assertFails(admin.doc("automationLeases/lease-a").get());
    await assertFails(admin.doc("automationLeases/new-lease").set({ owner: "operator" }));
  });
});
