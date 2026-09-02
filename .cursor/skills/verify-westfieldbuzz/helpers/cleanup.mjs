#!/usr/bin/env node
/**
 * Tear down only the Next.js process this verify run started (pid from the lockfile).
 * Never kill by process name. Never delete evidence under artifacts/.
 */
import {
  killProcessTree,
  lockPath,
  pidAlive,
  readLock,
  removeLock,
  sleep,
} from "./lib.mjs";

function print(result, code) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(code);
}

async function main() {
  const file = lockPath();
  const lock = readLock(file);
  if (!lock) {
    print({
      ok: true,
      action: "cleanup",
      skipped: true,
      reason: "no lockfile",
      lock: file,
      artifactsPreserved: true,
    }, 0);
  }

  const pid = lock.pid;
  let signaled = false;
  if (pidAlive(pid)) {
    signaled = killProcessTree(pid, "SIGTERM");
    const deadline = Date.now() + 8_000;
    while (pidAlive(pid) && Date.now() < deadline) {
      await sleep(200);
    }
    if (pidAlive(pid)) {
      killProcessTree(pid, "SIGKILL");
      await sleep(300);
    }
  }

  const stillAlive = pidAlive(pid);
  if (!stillAlive) removeLock(file);

  print({
    ok: !stillAlive,
    action: "cleanup",
    lock: file,
    pid,
    signaled,
    stillAlive,
    artifactsPreserved: true,
    note: stillAlive
      ? "pid still alive after SIGKILL; do not pkill by name — inspect the lock pid"
      : "lock removed; artifacts/ left in place",
  }, stillAlive ? 1 : 0);
}

main().catch((error) => {
  print({ ok: false, action: "cleanup", error: error instanceof Error ? error.message : String(error) }, 1);
});
