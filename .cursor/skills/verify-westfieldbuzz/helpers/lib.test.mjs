import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  APP_DIR,
  REPO_ROOT,
  SKILL_ROOT,
  canBind,
  firebasePublicPresent,
  ingestFlagsOn,
  isProductionUrl,
  parseEnvFile,
  pidAlive,
  readLock,
  removeLock,
  writeLock,
} from "./lib.mjs";

test("paths resolve to this repo's app/ and skill root", () => {
  assert.equal(path.basename(SKILL_ROOT), "verify-westfieldbuzz");
  assert.ok(fs.existsSync(path.join(APP_DIR, "package.json")));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, "CLAUDE.md")));
  assert.ok(fs.existsSync(path.join(APP_DIR, "e2e", "smoke.spec.ts")));
});

test("production URL detection only matches westfieldbuzz.com hosts", () => {
  assert.equal(isProductionUrl("https://westfieldbuzz.com"), true);
  assert.equal(isProductionUrl("https://www.westfieldbuzz.com/events"), true);
  assert.equal(isProductionUrl("http://127.0.0.1:3000"), false);
  assert.equal(isProductionUrl("https://westfieldbuzz.vercel.app"), false);
});

test("parseEnvFile reads KEY=value and ignores comments", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-env-"));
  const file = path.join(dir, ".env.local");
  fs.writeFileSync(file, "# hi\nNEXT_PUBLIC_FIREBASE_API_KEY=abc\nCRON_SECRET='secret'\n");
  const parsed = parseEnvFile(file);
  assert.equal(parsed.NEXT_PUBLIC_FIREBASE_API_KEY, "abc");
  assert.equal(parsed.CRON_SECRET, "secret");
  assert.equal(parsed.MISSING, undefined);
});

test("firebasePublicPresent requires all four client keys", () => {
  assert.equal(firebasePublicPresent({}), false);
  assert.equal(firebasePublicPresent({
    NEXT_PUBLIC_FIREBASE_API_KEY: "a",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "b",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "c",
    NEXT_PUBLIC_FIREBASE_APP_ID: "d",
  }), true);
});

test("ingestFlagsOn lists only flags set to the string true", () => {
  assert.deepEqual(ingestFlagsOn({ WESTFIELDBUZZ_ENABLE_INGEST: "true" }), ["WESTFIELDBUZZ_ENABLE_INGEST"]);
  assert.deepEqual(ingestFlagsOn({ WESTFIELDBUZZ_ENABLE_INGEST: "1" }), []);
});

test("lockfile round-trip and pidAlive for self", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-lock-"));
  const file = path.join(dir, "verify.lock.json");
  writeLock({ pid: process.pid, port: 3457 }, file);
  const lock = readLock(file);
  assert.equal(lock.pid, process.pid);
  assert.equal(lock.port, 3457);
  assert.equal(pidAlive(process.pid), true);
  assert.equal(pidAlive(99999999), false);
  removeLock(file);
  assert.equal(readLock(file), null);
});

test("canBind is a boolean for an ephemeral port", async () => {
  const free = await canBind(0);
  assert.equal(typeof free, "boolean");
});
