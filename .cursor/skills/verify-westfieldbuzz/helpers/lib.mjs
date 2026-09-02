#!/usr/bin/env node
/**
 * Shared paths and isolation primitives for verify-westfieldbuzz.
 * Lockfiles are JSON. Cleanup kills only the recorded pid/process group.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const SKILL_ROOT = path.resolve(here, "..");
export const REPO_ROOT = path.resolve(SKILL_ROOT, "../../..");
export const APP_DIR = path.join(REPO_ROOT, "app");
export const RUN_DIR = path.join(SKILL_ROOT, ".run");
export const ARTIFACTS_DIR = path.join(SKILL_ROOT, "artifacts");
export const DEFAULT_LOCK = path.join(RUN_DIR, "verify.lock.json");
export const DEFAULT_PORT = 3000;
export const DEFAULT_HOST = "127.0.0.1";
export const PRODUCTION_URL = "https://westfieldbuzz.com";
export const FIREBASE_PUBLIC_KEYS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
];

export const INGEST_ENABLE_FLAGS = [
  "WESTFIELDBUZZ_ENABLE_INGEST",
  "WESTFIELDBUZZ_ENABLE_DISCOVER",
  "WESTFIELDBUZZ_ENABLE_FRIDAY_DIGEST",
  "WESTFIELDBUZZ_ENABLE_FRESHNESS_WATCHDOG",
];

export function lockPath() {
  return process.env.VERIFY_LOCK ?? DEFAULT_LOCK;
}

export function artifactsRoot() {
  return process.env.VERIFY_ARTIFACTS_DIR ?? ARTIFACTS_DIR;
}

export function targetPort() {
  const raw = process.env.VERIFY_PORT;
  if (!raw) return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`VERIFY_PORT must be an integer 1–65535, got ${raw}`);
  }
  return port;
}

export function localBaseUrl(port = targetPort(), host = DEFAULT_HOST) {
  return `http://${host}:${port}`;
}

export function isProductionUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === "westfieldbuzz.com" || host === "www.westfieldbuzz.com";
  } catch {
    return false;
  }
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function readLock(file = lockPath()) {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const data = JSON.parse(raw);
  if (!data || typeof data !== "object") throw new Error(`Invalid lockfile: ${file}`);
  return data;
}

export function writeLock(data, file = lockPath()) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

export function removeLock(file = lockPath()) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function listeningPid(port, host = DEFAULT_HOST) {
  const ss = spawnSync("ss", ["-lptn", `sport = :${port}`], { encoding: "utf8" });
  if (ss.status === 0 && ss.stdout) {
    const match = ss.stdout.match(/pid=(\d+)/);
    if (match) return Number(match[1]);
  }
  const lsof = spawnSync("lsof", ["-t", `-iTCP@${host}:${port}`, "-sTCP:LISTEN"], {
    encoding: "utf8",
  });
  if (lsof.status === 0 && lsof.stdout.trim()) {
    const pid = Number(lsof.stdout.trim().split(/\s+/)[0]);
    if (Number.isInteger(pid) && pid > 0) return pid;
  }
  return null;
}

export function canBind(port, host = DEFAULT_HOST) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

export function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function localEnv() {
  const file = path.join(APP_DIR, ".env.local");
  const fromFile = parseEnvFile(file);
  const merged = { ...fromFile };
  for (const key of [...FIREBASE_PUBLIC_KEYS, "NEXT_PUBLIC_FIRESTORE_DB", "CRON_SECRET", ...INGEST_ENABLE_FLAGS]) {
    if (process.env[key]) merged[key] = process.env[key];
  }
  return { file, exists: fs.existsSync(file), values: merged };
}

export function firebasePublicPresent(envValues) {
  return FIREBASE_PUBLIC_KEYS.every((key) => typeof envValues[key] === "string" && envValues[key].length > 0);
}

export function ingestFlagsOn(envValues) {
  return INGEST_ENABLE_FLAGS.filter((key) => envValues[key] === "true");
}

export function isoRunId(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function killProcessTree(pid, signal = "SIGTERM") {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    try {
      process.kill(pid, signal);
      return true;
    } catch {
      return false;
    }
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
