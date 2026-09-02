#!/usr/bin/env node
/**
 * Read-only health check: process, port ownership, HTTP shell, firebase env presence, cron probe.
 * Prints JSON. Exit 0 when the chosen target is safe to drive; 1 otherwise.
 */
import {
  APP_DIR,
  PRODUCTION_URL,
  firebasePublicPresent,
  ingestFlagsOn,
  isProductionUrl,
  listeningPid,
  localBaseUrl,
  localEnv,
  lockPath,
  pidAlive,
  readLock,
  targetPort,
} from "./lib.mjs";
import { classifyCronProbe } from "./classify.mjs";
import { ROUTES } from "./selectors.mjs";

function print(result, code) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(code);
}

async function fetchText(url, init = {}) {
  const response = await fetch(url, { redirect: "follow", ...init });
  const text = await response.text();
  return { status: response.status, text, url: response.url };
}

function looksLikeAppShell(text) {
  return /Westfield Buzz/i.test(text) && /This week|Plan what's next|Describe the outing/i.test(text);
}

async function main() {
  const requested = process.env.VERIFY_BASE_URL ?? "";
  const lock = readLock();
  const envInfo = localEnv();
  const firebasePublic = firebasePublicPresent(envInfo.values);
  const flagsOn = ingestFlagsOn(envInfo.values);

  if (requested && isProductionUrl(requested)) {
    const home = await fetchText(requested.replace(/\/$/, "") + "/");
    const cron = await fetchText(requested.replace(/\/$/, "") + ROUTES.cronIngest);
    const cronProbe = classifyCronProbe(cron.status, cron.text);
    const ok = home.status === 200 && looksLikeAppShell(home.text) && cronProbe.ok;
    print({
      ok,
      action: "doctor",
      mode: "production-readonly",
      isolation: "shared-public-deployment",
      allowed: "read-only public GET and Playwright. Never POST /api/subscriptions, never /suggest submit, never login, never send CRON_SECRET, never enable ingest flags",
      target: requested,
      http: { status: home.status, shell: looksLikeAppShell(home.text), bytes: home.text.length },
      cronProbe,
      firebasePublic: "not-applicable-remote",
      ingestFlagsOn: flagsOn,
      lock: lock ? { pid: lock.pid, alive: pidAlive(lock.pid), port: lock.port } : null,
    }, ok ? 0 : 1);
  }

  const port = lock?.port ?? targetPort();
  const host = lock?.host ?? "127.0.0.1";
  const baseUrl = requested || localBaseUrl(port, host);
  const occupant = listeningPid(port, host);
  const pid = lock?.pid ?? occupant;
  const alive = pidAlive(pid);
  const owned = Boolean(lock && alive && lock.port === port && (occupant === null || occupant === pid || pidAlive(lock.pid)));

  if (!lock) {
    print({
      ok: false,
      action: "doctor",
      mode: "local",
      error: "no verify lockfile; this port is not owned by a verify launch",
      lock: lockPath(),
      port,
      occupantPid: occupant,
      isolation: occupant
        ? "refuse-shared-instance"
        : "not-running",
      hint: occupant
        ? "A server is listening but was not started by helpers/launch.mjs. Do not drive it. Launch on a free VERIFY_PORT or cleanup is N/A for foreign processes."
        : "Run helpers/launch.mjs, or set VERIFY_BASE_URL=https://westfieldbuzz.com for read-only production.",
      firebasePublic,
      envFile: envInfo.exists ? envInfo.file : null,
    }, 1);
  }

  if (!alive) {
    print({
      ok: false,
      action: "doctor",
      mode: "local",
      error: "lock pid is dead",
      lock: lockPath(),
      pid,
      port,
    }, 1);
  }

  if (occupant && lock.pid && occupant !== lock.pid) {
    // npx may spawn next-server as a child; treat descendant listen as owned if lock pid is alive.
    // Still refuse if lock pid is dead and a stranger holds the port.
    if (!pidAlive(lock.pid)) {
      print({
        ok: false,
        action: "doctor",
        mode: "local",
        error: "port is owned by a different process than the lock pid",
        lockPid: lock.pid,
        occupantPid: occupant,
        isolation: "refuse-shared-instance",
      }, 1);
    }
  }

  let home;
  try {
    home = await fetchText(baseUrl.replace(/\/$/, "") + "/");
  } catch (error) {
    print({
      ok: false,
      action: "doctor",
      mode: "local",
      error: "http fetch failed",
      baseUrl,
      detail: error instanceof Error ? error.message : String(error),
    }, 1);
  }

  let cronProbe = { ok: true, mode: "skipped", status: null, note: "cron probe failed to connect" };
  try {
    const cron = await fetchText(baseUrl.replace(/\/$/, "") + ROUTES.cronIngest);
    cronProbe = classifyCronProbe(cron.status, cron.text);
  } catch (error) {
    cronProbe = { ok: false, mode: "unreachable", status: null, note: error instanceof Error ? error.message : String(error) };
  }

  const shell = looksLikeAppShell(home.text);
  const ok = owned && home.status < 500 && shell && cronProbe.ok && flagsOn.length === 0;
  print({
    ok,
    action: "doctor",
    mode: "local",
    isolation: owned ? "verify-owned-instance" : "not-owned",
    target: baseUrl,
    lock: { path: lockPath(), pid: lock.pid, port: lock.port, log: lock.log, startedAt: lock.startedAt },
    process: { pidAlive: alive, occupantPid: occupant, cwd: APP_DIR },
    http: { status: home.status, shell, bytes: home.text.length },
    firebasePublic,
    envFile: envInfo.exists ? envInfo.file : null,
    ingestFlagsOn: flagsOn,
    cronProbe,
    driveHint: firebasePublic
      ? "local Firestore client config is present; drive public routes here"
      : "NEXT_PUBLIC_FIREBASE_* missing. Do not treat the local agenda as production data. Drive homepage/events/search against VERIFY_BASE_URL=https://westfieldbuzz.com (read-only).",
  }, ok ? 0 : 1);
}

main().catch((error) => {
  print({ ok: false, action: "doctor", error: error instanceof Error ? error.message : String(error) }, 1);
});
