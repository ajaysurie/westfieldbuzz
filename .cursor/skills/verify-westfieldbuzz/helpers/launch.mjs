#!/usr/bin/env node
/**
 * Start a dedicated Next.js dev server for verification.
 * Isolation: refuse if VERIFY_PORT is already bound by a pid that is not ours.
 * Does not enable WESTFIELDBUZZ_ENABLE_* flags. Does not seed production.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  APP_DIR,
  DEFAULT_HOST,
  RUN_DIR,
  canBind,
  ensureDir,
  firebasePublicPresent,
  ingestFlagsOn,
  killProcessTree,
  listeningPid,
  localBaseUrl,
  localEnv,
  lockPath,
  pidAlive,
  readLock,
  removeLock,
  sleep,
  targetPort,
  writeLock,
} from "./lib.mjs";

const READY_MS = Number(process.env.VERIFY_READY_MS ?? 90_000);

function fail(message, extra = {}) {
  console.error(JSON.stringify({ ok: false, error: message, ...extra }, null, 2));
  process.exit(1);
}

async function waitForHttp(url, pid) {
  const deadline = Date.now() + READY_MS;
  let lastError = "";
  while (Date.now() < deadline) {
    if (!pidAlive(pid)) {
      fail("dev server process exited before becoming ready", { pid, lastError });
    }
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status > 0) return response.status;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(500);
  }
  fail("timed out waiting for Next.js HTTP", { url, pid, lastError, waitedMs: READY_MS });
}

async function main() {
  const port = targetPort();
  const host = process.env.VERIFY_HOST ?? DEFAULT_HOST;
  const file = lockPath();
  const existing = readLock(file);
  if (existing?.pid && pidAlive(existing.pid)) {
    if (existing.port === port) {
      fail("a verify instance is already running on this port; reuse it after doctor, or cleanup first", {
        lock: file,
        pid: existing.pid,
        port,
        isolation: "refuse-double-drive",
      });
    }
    fail("a verify lock exists for another port; cleanup first or set VERIFY_LOCK to a second lockfile", {
      lock: file,
      pid: existing.pid,
      lockPort: existing.port,
      requestedPort: port,
    });
  }
  if (existing && !pidAlive(existing.pid)) {
    removeLock(file);
  }

  const occupant = listeningPid(port, host);
  if (occupant && pidAlive(occupant)) {
    fail("VERIFY_PORT is already bound by a process this run does not own", {
      port,
      occupantPid: occupant,
      isolation: "refuse-shared-instance",
      hint: "Set VERIFY_PORT to a free port (two Next instances can coexist on different ports) or stop the occupant yourself. Never pkill by name.",
    });
  }
  if (!(await canBind(port, host))) {
    fail("VERIFY_PORT cannot be bound", { port, host });
  }

  const envInfo = localEnv();
  const flagsOn = ingestFlagsOn(envInfo.values);
  if (flagsOn.length > 0) {
    fail("refusing to launch with ingest/digest flags enabled; verification must not run production cron jobs", {
      flagsOn,
    });
  }

  if (!fs.existsSync(path.join(APP_DIR, "package.json"))) {
    fail("app/package.json missing", { APP_DIR });
  }
  if (!fs.existsSync(path.join(APP_DIR, "node_modules", "next"))) {
    fail("app/node_modules/next missing; run npm ci in app/ first", { APP_DIR });
  }

  ensureDir(RUN_DIR);
  const logPath = path.join(RUN_DIR, `next-dev-${port}.log`);
  const logFd = fs.openSync(logPath, "w");
  const child = spawn("npx", ["next", "dev", "-p", String(port), "-H", host], {
    cwd: APP_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      // Keep ingest default-off even if a parent shell exported the flags.
      WESTFIELDBUZZ_ENABLE_INGEST: "false",
      WESTFIELDBUZZ_ENABLE_DISCOVER: "false",
      WESTFIELDBUZZ_ENABLE_FRIDAY_DIGEST: "false",
      WESTFIELDBUZZ_ENABLE_FRESHNESS_WATCHDOG: "false",
    },
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  fs.closeSync(logFd);
  if (!child.pid) {
    fail("failed to spawn next dev");
  }
  child.unref();

  const lock = {
    pid: child.pid,
    port,
    host,
    cwd: APP_DIR,
    log: logPath,
    startedAt: new Date().toISOString(),
    command: `npx next dev -p ${port} -H ${host}`,
    firebasePublic: firebasePublicPresent(envInfo.values),
    envFile: envInfo.exists ? envInfo.file : null,
  };
  writeLock(lock, file);

  const baseUrl = localBaseUrl(port, host);
  try {
    const status = await waitForHttp(baseUrl, child.pid);
    lock.readyAt = new Date().toISOString();
    lock.httpStatus = status;
    writeLock(lock, file);
    console.log(JSON.stringify({
      ok: true,
      action: "launch",
      pid: child.pid,
      port,
      host,
      baseUrl,
      lock: file,
      log: logPath,
      firebasePublic: lock.firebasePublic,
      readyHint: lock.firebasePublic
        ? "doctor next; local UI can load Firestore data"
        : "app/.env.local is missing NEXT_PUBLIC_FIREBASE_*; doctor will say so. Drive data-dependent features against VERIFY_BASE_URL=https://westfieldbuzz.com (read-only) instead of this instance",
    }, null, 2));
  } catch (error) {
    killProcessTree(child.pid, "SIGTERM");
    removeLock(file);
    throw error;
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
