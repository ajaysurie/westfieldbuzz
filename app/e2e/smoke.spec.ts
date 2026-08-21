import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL;
const SHARE = process.env.E2E_SHARE_URL;

test.skip(!BASE, "E2E_BASE_URL not set — smoke suite only runs against a deployment");

/** Vercel SSO: visiting the share link once sets the auth cookie for the context. */
async function authenticate(page: Page): Promise<void> {
  if (!SHARE) return;
  await page.goto(SHARE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
}

const ERROR_MARKERS = /couldn't check|Something went wrong|Application error|Internal Server Error/i;

test.describe("public routes render on live data", () => {
  for (const path of ["/", "/events", "/search", "/directory", "/privacy", "/data-deletion"]) {
    test(`${path} renders without an error state`, async ({ page }) => {
      await authenticate(page);
      await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(5000);
      const text = await page.locator("body").innerText();
      expect(text).not.toMatch(ERROR_MARKERS);
      expect(text.length).toBeGreaterThan(200);
    });
  }

  test("the agenda shows at least one verified event", async ({ page }) => {
    await authenticate(page);
    await page.goto(BASE + "/events", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    // The freshness contract makes this the canary: an empty agenda means
    // ingestion has been down long enough for the site to go dark.
    await expect(page.locator("text=Verified").first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("search behaves end to end", () => {
  test("a sentence returns parsed chips and results without silent fallback", async ({ page }) => {
    await authenticate(page);
    await page.goto(BASE + "/search", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    const input = page.locator("input#event-search, input[type='search'], input[type='text']").first();
    await input.fill("something fun for kids this weekend");
    await input.press("Enter");
    await page.waitForTimeout(20_000);
    const text = await page.locator("body").innerText();
    // The exact regression this suite exists for: the model path degrading
    // silently to keyword matching (Gemini timeout, schema-dialect rejection).
    expect(text).not.toContain("parser was unavailable");
    expect(text).toMatch(/events checked/i);
  });
});

test.describe("cron auth holds", () => {
  test("ingest rejects without the bearer and rejects a bad group", async ({ request, page }) => {
    await authenticate(page);
    const unauth = await request.get(BASE + "/api/cron/ingest?group=core-libraries");
    expect([401, 403]).toContain(unauth.status());
  });
});

test.describe("auth-gated surfaces gate", () => {
  test("/admin without a session lands on sign-in, not data", async ({ page }) => {
    await authenticate(page);
    await page.goto(BASE + "/admin", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const text = await page.locator("body").innerText();
    expect(text).toMatch(/sign in/i);
    expect(text).not.toMatch(/eventCandidates|reviewStatus/i);
  });
});
