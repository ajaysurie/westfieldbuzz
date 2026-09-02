import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";

import { eventIdentityFingerprint } from "../identity";
import { reconcileSource } from "../firestore-repository";
import type { EventSourcePolicy, SourceObservation } from "../types";

type Stored = Record<string, unknown>;

class FakeSnapshot {
  constructor(readonly id: string, private readonly value: Stored | undefined) {}
  get exists() { return this.value !== undefined; }
  data(): Stored { return this.value ?? {}; }
}

class FakeReference {
  constructor(readonly db: FakeFirestore, readonly path: string) {}
  get id() { return this.path.split("/").at(-1)!; }
  collection(name: string) { return new FakeCollection(this.db, `${this.path}/${name}`); }
  get() { return Promise.resolve(new FakeSnapshot(this.id, this.db.read(this.path))); }
  set(value: Stored, options?: { merge?: boolean }) { this.db.write(this.path, value, options?.merge); return Promise.resolve(); }
}

class FakeCollection {
  constructor(private readonly db: FakeFirestore, private readonly path: string) {}
  doc(id: string) { return new FakeReference(this.db, `${this.path}/${id}`); }
  where(field: string, _operator: string, value: unknown) {
    return { get: async () => ({ docs: this.docs().filter((document) => document.data()[field] === value) }) };
  }
  async get() { return { docs: this.docs() }; }
  private docs() {
    const prefix = `${this.path}/`;
    return [...this.db.documents.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
      .map(([path, value]) => new FakeSnapshot(path.slice(prefix.length), value));
  }
}

class FakeBatch {
  protected writes: Array<() => void> = [];
  set(reference: FakeReference, value: Stored, options?: { merge?: boolean }) {
    this.writes.push(() => reference.set(value, options));
    return this;
  }
  async commit() { this.writes.forEach((write) => write()); }
}

class FakeTransaction extends FakeBatch {
  get(reference: FakeReference) { return reference.get(); }
  delete(reference: FakeReference) { this.writes.push(() => reference.db.documents.delete(reference.path)); return this; }
}

class FakeFirestore {
  documents = new Map<string, Stored>();
  private transactionTail = Promise.resolve();
  collection(name: string) { return new FakeCollection(this, name); }
  batch() { return new FakeBatch(); }
  runTransaction<T>(fn: (transaction: FakeTransaction) => Promise<T>) {
    const run = this.transactionTail.then(async () => {
      const transaction = new FakeTransaction();
      const result = await fn(transaction);
      await transaction.commit();
      return result;
    });
    this.transactionTail = run.then(() => undefined, () => undefined);
    return run;
  }
  read(path: string) { return this.documents.get(path); }
  write(path: string, value: Stored, merge = false) {
    this.documents.set(path, merge ? { ...(this.documents.get(path) ?? {}), ...value } : value);
  }
  seed(path: string, value: Stored | object) { this.write(path, value as Stored); }
  documentsIn(collection: string) {
    const prefix = `${collection}/`;
    return [...this.documents.entries()].filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"));
  }
}

const checkedAt = new Date("2026-08-20T12:00:00.000Z");

function source(id: string): EventSourcePolicy {
  return {
    id, name: id, type: "ical", url: "https://example.com/feed.ics", town: "Westfield",
    timezone: "America/New_York", autoApprove: true, missingGraceRuns: 2,
    group: "core-libraries", allowedHosts: ["example.com"], expectedContentTypes: ["text/calendar"],
    timeoutMs: 1000, maxResponseBytes: 1000, freshnessThresholdHours: 24,
  };
}

function observation(overrides: Partial<SourceObservation> = {}): SourceObservation {
  return {
    title: "Story time", description: "Stories", date: new Date("2026-08-22T14:00:00.000Z"), endDate: null,
    location: "Memorial Library", town: "Westfield", category: "Family & Kids", status: "scheduled",
    availability: "unknown", sourceId: "source-a", sourceEventId: "123", sourceUrl: "https://example.com/123", ...overrides,
  };
}

async function reconcile(db: FakeFirestore, policy: EventSourcePolicy, event = observation()) {
  return reconcileSource({ db: db as unknown as Firestore, source: policy, observations: [event], checkedAt,
    from: new Date("2026-08-01"), to: new Date("2026-08-31"), complete: true, write: true });
}

describe("Firestore identity claims", () => {
  it("safety-holds the same virtual author talk syndicated by two libraries", async () => {
    const db = new FakeFirestore();
    const summit = observation({
      title: "Virtual Author Talk with David O. Stewart",
      location: "Summit Free Public Library",
      town: "Summit",
      sourceId: "summit-libcal",
    });
    const westfield = observation({
      title: summit.title,
      location: "Westfield Memorial Library",
      sourceId: "wml-libcal",
    });
    const fingerprint = eventIdentityFingerprint(summit);
    db.seed("events/summit-talk", { ...summit, identityFingerprint: fingerprint.hash });

    const result = await reconcile(db, source("wml-libcal"), westfield);

    expect(result).toMatchObject({ created: 0, candidates: 1, safetyHeld: true });
    expect(db.documentsIn("eventCandidates")[0]?.[1]).toMatchObject({
      reason: "possible-cross-source-duplicate",
      matchingEventIds: ["summit-talk"],
    });
  });

  it("holds a different-source fingerprint match as an admin candidate", async () => {
    const db = new FakeFirestore();
    const event = observation({ sourceId: "source-b" });
    const fingerprint = eventIdentityFingerprint(event);
    db.seed("events/event-a", { ...event, sourceId: "source-a", identityFingerprint: fingerprint.hash });

    const result = await reconcile(db, source("source-b"), event);

    expect(result).toMatchObject({ created: 0, candidates: 1, safetyHeld: true });
    expect(db.documentsIn("events")).toHaveLength(1);
    expect(db.documentsIn("eventCandidates")[0]?.[1]).toMatchObject({
      reason: "possible-cross-source-duplicate", matchingEventIds: ["event-a"], matchingSourceIds: ["source-a"],
    });
  });

  it("keeps same-source updates on the original event while moving its owned claim", async () => {
    const db = new FakeFirestore();
    const before = observation({ title: "Old title" });
    const after = observation({ title: "New title" });
    const oldIdentity = eventIdentityFingerprint(before);
    const newIdentity = eventIdentityFingerprint(after);
    db.seed("events/event-a", { ...before, identityFingerprint: oldIdentity.hash });
    db.seed(`eventFingerprintRegistry/${oldIdentity.hash}`, { eventId: "event-a", sourceId: "source-a" });

    const result = await reconcile(db, source("source-a"), after);

    expect(result).toMatchObject({ updated: 1, candidates: 0 });
    expect(db.read("events/event-a")).toMatchObject({ title: "New title", identityFingerprint: newIdentity.hash });
    expect(db.read(`eventFingerprintRegistry/${oldIdentity.hash}`)).toBeUndefined();
    expect(db.read(`eventFingerprintRegistry/${newIdentity.hash}`)).toMatchObject({ eventId: "event-a" });
  });

  it("holds an update when its new fingerprint is claimed by another event", async () => {
    const db = new FakeFirestore();
    const before = observation({ title: "Old title" });
    const after = observation({ title: "New title" });
    const oldIdentity = eventIdentityFingerprint(before);
    const newIdentity = eventIdentityFingerprint(after);
    db.seed("events/event-a", { ...before, identityFingerprint: oldIdentity.hash });
    db.seed("events/event-b", { ...after, sourceId: "source-b", identityFingerprint: newIdentity.hash });
    db.seed(`eventFingerprintRegistry/${oldIdentity.hash}`, { eventId: "event-a", sourceId: "source-a" });
    db.seed(`eventFingerprintRegistry/${newIdentity.hash}`, { eventId: "event-b", sourceId: "source-b" });

    const result = await reconcile(db, source("source-a"), after);

    expect(result).toMatchObject({ updated: 0, candidates: 1, safetyHeld: true });
    expect(db.read("events/event-a")).toMatchObject({ title: "Old title", identityFingerprint: oldIdentity.hash });
    expect(db.read(`eventFingerprintRegistry/${oldIdentity.hash}`)).toBeDefined();
  });

  it("does not count a held verify as successfully verified", async () => {
    const db = new FakeFirestore();
    const event = observation();
    const identity = eventIdentityFingerprint(event);
    db.seed("events/event-a", { ...event, identityFingerprint: identity.hash });
    db.seed("events/event-b", { ...event, sourceId: "source-b", identityFingerprint: identity.hash });
    db.seed(`eventFingerprintRegistry/${identity.hash}`, { eventId: "event-b", sourceId: "source-b" });

    const result = await reconcile(db, source("source-a"), event);

    expect(result).toMatchObject({ verified: 0, candidates: 1, safetyHeld: true, actions: [] });
  });

  it("claims a pre-registry same-source update", async () => {
    const db = new FakeFirestore();
    const before = observation({ title: "Old title" });
    const after = observation({ title: "New title" });
    const identity = eventIdentityFingerprint(after);
    db.seed("events/event-a", before);

    await reconcile(db, source("source-a"), after);

    expect(db.read(`eventFingerprintRegistry/${identity.hash}`)).toMatchObject({ eventId: "event-a" });
  });

  it("allows only one of two concurrent cross-source creates to publish", async () => {
    const db = new FakeFirestore();
    const eventA = observation({ sourceId: "source-a" });
    const eventB = observation({ sourceId: "source-b", sourceEventId: "other" });
    const [first, second] = await Promise.all([
      reconcile(db, source("source-a"), eventA),
      reconcile(db, source("source-b"), eventB),
    ]);

    expect(first.created + second.created).toBe(1);
    expect(first.candidates + second.candidates).toBe(1);
    expect(db.documentsIn("events")).toHaveLength(1);
    expect(db.documentsIn("eventCandidates")).toHaveLength(1);
  });

  it("holds a registry that points to a missing event", async () => {
    const db = new FakeFirestore();
    const event = observation();
    const identity = eventIdentityFingerprint(event);
    db.seed(`eventFingerprintRegistry/${identity.hash}`, { eventId: "missing", sourceId: "source-z" });

    const result = await reconcile(db, source("source-a"), event);

    expect(result).toMatchObject({ created: 0, candidates: 1, safetyHeld: true });
    expect(db.documentsIn("eventCandidates")[0]?.[1]).toMatchObject({ reason: "fingerprint-registry-inconsistency" });
  });
});
