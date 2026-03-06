/**
 * Facebook Group Scraper v6 — Click "X comments" buttons to open posts
 *
 * Strategy: Search → click "X comments" button on each post → scrape comments with aria-label
 * Saves incrementally after each search term.
 *
 * Usage:
 *   1. CLOSE Chrome completely
 *   2. npx tsx scripts/scrape-fb.ts
 *
 * Output: scripts/raw-posts.json
 */

import { chromium, type Page, type BrowserContext } from "playwright";
import * as fs from "fs";
import * as path from "path";

const CHROME_PROFILE = path.join(
  process.env.HOME || "",
  "Library/Application Support/Google/Chrome/Default"
);

const GROUPS = [
  { name: "Westfield NJ", url: "https://www.facebook.com/groups/westfieldnjgroup" },
  { name: "The Dads of Westfield", url: "https://www.facebook.com/groups/413946119005979" },
];

const SEARCH_TERMS = [
  "recommend",
  "looking for",
  "anyone know",
  "plumber",
  "electrician",
  "contractor",
  "landscaper",
  "handyman",
  "painter",
  "HVAC",
  "roofer",
  "dentist",
  "pediatrician",
  "attorney",
  "accountant",
  "caterer",
  "bartender",
  "personal chef",
  "babysitter",
  "nanny",
  "music lessons",
  "tutor",
  "realtor",
  "photographer",
  "mover",
  "exterminator",
  "pool service",
  "tree removal",
  "snow plow",
  "cleaning",
  "gutters",
  "interior designer",
];

interface RawPost {
  group: string;
  searchTerm: string;
  postText: string;
  comments: string[];
  postUrl: string;
  timestamp: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const delay = (min = 2000, max = 4000) => sleep(min + Math.random() * (max - min));

const OUT_PATH = path.join(__dirname, "raw-posts.json");

function saveProgress(allPosts: RawPost[]) {
  fs.writeFileSync(OUT_PATH, JSON.stringify(allPosts, null, 2));
}

/**
 * On the post page (after clicking "X comments"), expand all comments
 * and extract post text + comments using aria-label selectors.
 */
async function scrapePostPage(page: Page): Promise<{ postText: string; comments: string[] }> {
  // Click "See more" to expand truncated text
  for (let i = 0; i < 3; i++) {
    const expanded = await page.evaluate(() => {
      let count = 0;
      document.querySelectorAll('[role="button"]').forEach((el) => {
        const text = (el as HTMLElement).textContent?.trim() || "";
        if (text === "See more") {
          (el as HTMLElement).click();
          count++;
        }
      });
      return count;
    });
    if (expanded === 0) break;
    await delay(800, 1200);
  }

  // Expand comments: click "View more comments", "View X replies", etc.
  for (let round = 0; round < 8; round++) {
    const clicked = await page.evaluate(() => {
      let found = 0;
      document.querySelectorAll('[role="button"], span').forEach((el) => {
        const text = (el as HTMLElement).textContent?.trim() || "";
        if (
          /^View\s+\d*\s*(more\s+)?comments?$/i.test(text) ||
          /^View\s+\d+\s*(more\s+)?repl(y|ies)$/i.test(text) ||
          /^View\s+all\s+\d+\s+comments?$/i.test(text) ||
          text === "See more replies" ||
          /^View\s+previous\s+comments?$/i.test(text)
        ) {
          (el as HTMLElement).click();
          found++;
        }
      });
      return found;
    });
    if (clicked === 0) break;
    await delay(1500, 2500);
  }

  await delay(1000, 1500);

  // Extract using aria-label="Comment by ..." selectors
  return page.evaluate(() => {
    const uiNoise = /^(Like|Reply|Share|Edited|\d+[hdwmy]|\d+\s*$|\d+ (replies|reply)|Hide \d+ repl(y|ies)|View \d+ (more\s+)?repl(y|ies)|See more|Author|Admin|Moderator|Top contributor|Group expert)$/i;

    // Comments: elements with aria-label="Comment by [Name] [time] ago"
    const commentEls = document.querySelectorAll('[aria-label^="Comment by"]');
    const comments: string[] = [];

    for (const el of commentEls) {
      const rawText = (el as HTMLElement).innerText || "";
      const lines = rawText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
      const commenterName = lines[0] || "";
      const textLines = lines.slice(1).filter(l => !uiNoise.test(l) && l.length > 2);
      const commentText = textLines.join(" ").trim();
      if (commentText.length > 5) {
        comments.push(`${commenterName}: ${commentText}`);
      }
    }

    // Post text: find role="article" NOT marked as comment
    let postText = "";
    const articles = document.querySelectorAll('[role="article"]');
    for (const art of articles) {
      const label = art.getAttribute("aria-label") || "";
      if (label.startsWith("Comment by")) continue;
      const text = (art as HTMLElement).innerText?.trim() || "";
      if (text.length > 50 && text.length > postText.length) {
        const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
        const cleanLines = lines.filter(l => !uiNoise.test(l));
        postText = cleanLines.join("\n").trim();
      }
    }

    // Fallback for post text
    if (!postText) {
      const main = document.querySelector('[role="main"]');
      if (main) {
        const text = (main as HTMLElement).innerText || "";
        const idx = text.indexOf("Most relevant");
        const altIdx = text.indexOf("All comments");
        const cutoff = Math.min(
          idx > 0 ? idx : Infinity,
          altIdx > 0 ? altIdx : Infinity,
          2000
        );
        postText = text.slice(0, cutoff).trim();
      }
    }

    return { postText, comments };
  });
}

/**
 * Get the number of unique "X comments" buttons on the search page.
 * Returns the count of posts with visible comment counts.
 */
async function getCommentButtonCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const seen = new Set<string>();
    let count = 0;
    document.querySelectorAll('div[role="button"]').forEach((el) => {
      const text = (el as HTMLElement).textContent?.trim() || "";
      if (/^\d+\s+comments?$/.test(text)) {
        // Use position to deduplicate (multiple elements for same button)
        const rect = el.getBoundingClientRect();
        const key = `${Math.round(rect.y)}`;
        if (!seen.has(key)) {
          seen.add(key);
          count++;
        }
      }
    });
    return count;
  });
}

/**
 * Click the nth "X comments" button on the page.
 * Returns true if clicked successfully.
 */
async function clickCommentButton(page: Page, index: number): Promise<boolean> {
  return page.evaluate((idx: number) => {
    const seen = new Set<string>();
    let count = 0;
    const buttons = document.querySelectorAll('div[role="button"]');
    for (const el of buttons) {
      const text = (el as HTMLElement).textContent?.trim() || "";
      if (/^\d+\s+comments?$/.test(text)) {
        const rect = el.getBoundingClientRect();
        const key = `${Math.round(rect.y)}`;
        if (!seen.has(key)) {
          seen.add(key);
          if (count === idx) {
            (el as HTMLElement).click();
            return true;
          }
          count++;
        }
      }
    }
    return false;
  }, index);
}

async function scrapeGroup(
  context: BrowserContext,
  group: (typeof GROUPS)[number],
  allPosts: RawPost[]
) {
  const page = await context.newPage();
  console.log(`\n📍 ${group.name}`);
  await page.goto(group.url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await delay(3000, 5000);
  console.log(`  Title: ${await page.title()}`);

  const seenPostKeys = new Set<string>();

  for (const term of SEARCH_TERMS) {
    process.stdout.write(`  🔍 "${term}": `);

    try {
      const searchUrl = `${group.url}/search/?q=${encodeURIComponent(term)}`;
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
      await delay(3000, 5000);

      // Scroll to load more results
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
        await delay(1500, 2500);
      }

      // Count comment buttons on the page
      const buttonCount = await getCommentButtonCount(page);
      process.stdout.write(`${buttonCount} posts `);

      let newCount = 0;
      let commentTotal = 0;

      // Click each "X comments" button to open the post
      for (let i = 0; i < Math.min(buttonCount, 10); i++) {
        try {
          // Re-navigate to search for each post (going back is unreliable on FB)
          if (i > 0) {
            await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
            await delay(2000, 3000);
            for (let s = 0; s < 4; s++) {
              await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
              await delay(1000, 1500);
            }
          }

          const clicked = await clickCommentButton(page, i);
          if (!clicked) continue;

          await delay(3000, 5000);

          // Capture the URL we ended up on
          const postUrl = page.url();

          const { postText, comments } = await scrapePostPage(page);

          const key = postText.slice(0, 150);
          if (postText.length > 20 && !seenPostKeys.has(key)) {
            seenPostKeys.add(key);
            allPosts.push({
              group: group.name,
              searchTerm: term,
              postText,
              comments,
              postUrl,
              timestamp: new Date().toISOString(),
            });
            newCount++;
            commentTotal += comments.length;
            if (comments.length > 0) {
              process.stdout.write(`📝${comments.length} `);
            }
          }
        } catch {
          // Try to go back to search on error
          try {
            await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
            await delay(2000, 3000);
          } catch { break; }
        }
      }

      // Fallback: if no comment buttons found, save search page text
      if (buttonCount === 0) {
        const searchPageData = await page.evaluate(() => {
          const results: { text: string }[] = [];
          const seen = new Set<string>();
          document.querySelectorAll("[data-ad-preview], [aria-posinset]").forEach((el) => {
            const text = (el as HTMLElement).innerText?.trim() || "";
            if (text.length > 50 && !seen.has(text)) {
              seen.add(text);
              results.push({ text });
            }
          });
          return results;
        });

        for (const item of searchPageData) {
          const key = item.text.slice(0, 150);
          if (!seenPostKeys.has(key)) {
            seenPostKeys.add(key);
            allPosts.push({
              group: group.name,
              searchTerm: term,
              postText: item.text,
              comments: [],
              postUrl: "",
              timestamp: new Date().toISOString(),
            });
            newCount++;
          }
        }
        if (searchPageData.length > 0) process.stdout.write(`(text) `);
      }

      console.log(`→ ${newCount} new, ${commentTotal} comments`);

      // Incremental save
      saveProgress(allPosts);
    } catch (err) {
      console.log(`failed`);
    }

    await delay();
  }

  await page.close();
}

async function main() {
  console.log("🚀 Facebook Group Scraper v6 (click comment buttons)");
  console.log(`Groups: ${GROUPS.map((g) => g.name).join(", ")}`);
  console.log(`Search terms: ${SEARCH_TERMS.length}\n`);

  if (!fs.existsSync(CHROME_PROFILE)) {
    console.error("❌ Chrome profile not found");
    process.exit(1);
  }

  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(CHROME_PROFILE, {
      headless: false,
      channel: "chrome",
      args: ["--disable-blink-features=AutomationControlled"],
      viewport: { width: 1280, height: 900 },
    });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("lock") || msg.includes("already in use") || msg.includes("SingletonLock")) {
      console.error("❌ Close Chrome first!");
    } else {
      console.error("❌ Launch failed:", msg);
    }
    process.exit(1);
  }

  const allPosts: RawPost[] = [];

  try {
    for (const group of GROUPS) {
      await scrapeGroup(context, group, allPosts);
    }
  } finally {
    await context.close();
  }

  // Final save
  saveProgress(allPosts);

  const totalComments = allPosts.reduce((sum, p) => sum + p.comments.length, 0);
  console.log(`\n✅ Done! ${allPosts.length} posts with ${totalComments} total comments`);
  console.log(`   Saved to: ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Scrape failed:", err);
  process.exit(1);
});
