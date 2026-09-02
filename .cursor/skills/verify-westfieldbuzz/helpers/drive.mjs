#!/usr/bin/env node
/**
 * Drive one mapped feature with Playwright against a doctor-approved base URL.
 * Evidence goes under artifacts/<run-id>/. Cleanup must not delete this directory.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { classifyEventsText, classifyHomepageText } from "./classify.mjs";
import {
  APP_DIR,
  PRODUCTION_URL,
  artifactsRoot,
  ensureDir,
  isoRunId,
  isProductionUrl,
  localBaseUrl,
  lockPath,
  readLock,
} from "./lib.mjs";
import { COPY, ROUTES, SELECTORS } from "./selectors.mjs";

const requireFromApp = createRequire(path.join(APP_DIR, "package.json"));

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function fail(message, extra = {}) {
  console.error(JSON.stringify({ ok: false, error: message, ...extra }, null, 2));
  process.exit(1);
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function resolveBaseUrl() {
  if (process.env.VERIFY_BASE_URL) return process.env.VERIFY_BASE_URL.replace(/\/$/, "");
  const lock = readLock(lockPath());
  if (lock?.port) return localBaseUrl(lock.port, lock.host ?? "127.0.0.1");
  return localBaseUrl();
}

async function waitForHomepageSettled(page) {
  await page.getByRole("heading", { level: 1, name: COPY.homeH1 }).waitFor({ timeout: 20_000 });
  await page.locator(SELECTORS.weekHeading).waitFor({ timeout: 20_000 });
  const deadline = Date.now() + 25_000;
  let text = await page.locator("body").innerText();
  let classification = classifyHomepageText(text);
  while (classification.state === "loading" && Date.now() < deadline) {
    await page.waitForTimeout(500);
    text = await page.locator("body").innerText();
    classification = classifyHomepageText(text);
  }
  return { text, classification };
}

async function driveHomepage(page, outDir, baseUrl) {
  await page.goto(`${baseUrl}${ROUTES.home}`, { waitUntil: "domcontentloaded" });
  const { text, classification } = await waitForHomepageSettled(page);
  await page.screenshot({ path: path.join(outDir, "homepage.png"), fullPage: true });

  const nav = page.locator(SELECTORS.primaryNav);
  const navVisible = await nav.isVisible();
  const fridayVisible = await page.locator(SELECTORS.fridaySection).isVisible();
  const searchVisible = await page.locator(SELECTORS.homeSearch).isVisible();
  const cardCount = await page.locator(SELECTORS.eventCard).count();

  const fatal = classification.state === "error";
  const ok = !fatal && navVisible && searchVisible && fridayVisible && ["populated", "empty", "shell"].includes(classification.state);

  return {
    feature: "homepage-this-week",
    ok,
    classification,
    observed: {
      navVisible,
      searchVisible,
      fridayVisible,
      eventCardCount: cardCount,
      bodyChars: text.length,
    },
    mutationsAttempted: false,
    productionSafe: isProductionUrl(baseUrl),
    note: classification.state === "empty"
      ? "Empty this-week agenda is a valid observation (do not 'fix' ingest in a verification-only change)."
      : classification.state === "populated"
        ? "This-week agenda rendered event cards."
        : undefined,
  };
}

async function driveEvents(page, outDir, baseUrl) {
  await page.goto(`${baseUrl}${ROUTES.events}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1, name: COPY.eventsH1 }).waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: "Agenda" }).waitFor({ timeout: 20_000 });
  const deadline = Date.now() + 25_000;
  let text = await page.locator("body").innerText();
  let classification = classifyEventsText(text);
  while (classification.state === "loading" && Date.now() < deadline) {
    await page.waitForTimeout(500);
    text = await page.locator("body").innerText();
    classification = classifyEventsText(text);
  }
  await page.screenshot({ path: path.join(outDir, "events-agenda.png"), fullPage: true });

  await page.getByRole("button", { name: "Calendar" }).click();
  await page.waitForURL(/view=calendar/, { timeout: 15_000 });
  await page.locator(SELECTORS.monthCalendar).waitFor({ timeout: 20_000 });
  await page.screenshot({ path: path.join(outDir, "events-calendar.png"), fullPage: true });
  const cardCount = await page.locator(SELECTORS.eventCard).count();
  const ok = classification.state !== "error";
  return {
    feature: "events-calendar",
    ok,
    classification,
    observed: { eventCardCount: cardCount, calendarView: true, bodyChars: text.length },
    mutationsAttempted: false,
  };
}

async function driveSearch(page, outDir, baseUrl) {
  await page.goto(`${baseUrl}${ROUTES.search}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1, name: COPY.searchH1 }).waitFor({ timeout: 20_000 });
  const input = page.locator(SELECTORS.eventSearch);
  await input.fill("something fun for kids this weekend");
  await page.getByRole("button", { name: "Search" }).click();
  await page.waitForTimeout(20_000);
  const text = await page.locator("body").innerText();
  await page.screenshot({ path: path.join(outDir, "search.png"), fullPage: true });
  const parserFellBack = text.includes(COPY.parserUnavailable);
  const checked = COPY.eventsChecked.test(text);
  const noMatches = /No exact matches yet/.test(text);
  const ok = !/Application error|Internal Server Error/i.test(text) && (checked || noMatches || parserFellBack);
  return {
    feature: "event-search",
    ok,
    classification: { surface: "search", state: checked ? "results" : noMatches ? "no-matches" : parserFellBack ? "parser-fallback" : "unknown" },
    observed: { parserFellBack, eventsChecked: checked, noMatches, bodyChars: text.length },
    mutationsAttempted: false,
    note: parserFellBack
      ? "Parser fallback is an observation, not a prompt to ship AI-copy product fixes in a verify-only change."
      : undefined,
  };
}

async function main() {
  const feature = argValue("--feature") ?? "homepage-this-week";
  const allowed = new Set(["homepage-this-week", "events-calendar", "event-search"]);
  if (!allowed.has(feature)) {
    fail("unknown --feature", { feature, allowed: [...allowed] });
  }

  const baseUrl = resolveBaseUrl();
  const runId = process.env.VERIFY_RUN_ID ?? isoRunId();
  const outDir = path.join(artifactsRoot(), `${runId}-${feature}`);
  ensureDir(outDir);

  if (isProductionUrl(baseUrl) && ["friday-subscribe"].includes(feature)) {
    fail("refusing to drive mutating features against production", { feature, baseUrl });
  }

  let playwright;
  try {
    playwright = requireFromApp("playwright");
  } catch {
    fail("playwright is not installed in app/; run npm ci in app/ and npx playwright install chromium", {
      APP_DIR,
    });
  }

  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordHar: { path: path.join(outDir, "network.har"), content: "omit" },
  });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  const consoleLines = [];
  page.on("console", (msg) => consoleLines.push(`${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (error) => consoleLines.push(`pageerror: ${error.message}`));

  let result;
  try {
    if (feature === "homepage-this-week") result = await driveHomepage(page, outDir, baseUrl);
    else if (feature === "events-calendar") result = await driveEvents(page, outDir, baseUrl);
    else result = await driveSearch(page, outDir, baseUrl);
  } finally {
    await context.tracing.stop({ path: path.join(outDir, "trace.zip") });
    await context.close();
    await browser.close();
  }

  fs.writeFileSync(path.join(outDir, "console.log"), consoleLines.join("\n") + (consoleLines.length ? "\n" : ""));
  const report = {
    ok: Boolean(result?.ok),
    action: "drive",
    feature,
    baseUrl,
    productionReadonly: isProductionUrl(baseUrl),
    outDir,
    evidence: {
      screenshot: fs.existsSync(path.join(outDir, "homepage.png")) ? "homepage.png" : fs.existsSync(path.join(outDir, "events-agenda.png")) ? "events-agenda.png" : "search.png",
      trace: "trace.zip",
      har: "network.har",
      console: "console.log",
    },
    result,
    at: new Date().toISOString(),
  };
  writeJson(path.join(outDir, "drive.json"), report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
