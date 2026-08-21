import { defineConfig } from "@playwright/test";

/**
 * Post-deploy smoke suite. Not unit tests: these drive a real deployment in a
 * real browser and fail on the failures unit tests structurally cannot see —
 * seams between components, and seams between us and external APIs.
 *
 * Usage:
 *   E2E_BASE_URL=https://<deployment> npx playwright test
 *   E2E_SHARE_URL=<vercel share link>   # when the deployment sits behind SSO
 *
 * Without E2E_BASE_URL the suite skips itself, so `vitest` and CI unit runs
 * are unaffected.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  retries: 1,
  workers: 2,
  use: {
    baseURL: process.env.E2E_BASE_URL,
    viewport: { width: 1280, height: 900 },
  },
  reporter: [["list"]],
});
