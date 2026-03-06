/**
 * LLM-powered parser: extracts businesses from Facebook comments using Gemini
 *
 * Usage:
 *   GEMINI_API_KEY=... npx tsx scripts/parse-posts-llm.ts
 *
 * Input:  scripts/raw-posts.json
 * Output: src/data/scraped-businesses.json
 *         scripts/businesses-review.json
 */

import * as fs from "fs";
import * as path from "path";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY environment variable is required");
  process.exit(1);
}
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

interface RawPost {
  group: string;
  searchTerm: string;
  postText: string;
  comments: string[];
  postUrl: string;
  timestamp: string;
}

interface ExtractedBusiness {
  name: string;
  category: string;
  phone: string;
  website: string;
  email: string;
  recommendedBy: string[];
}

interface Business {
  name: string;
  category: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  recommendations: number;
  recommendedBy: string[];
  mentions: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callGemini(prompt: string, retries = 5): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 16384,
        },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }

    if (res.status === 429 && attempt < retries - 1) {
      const waitMs = (attempt + 1) * 15000;
      console.log(`    ⏳ Rate limited, waiting ${waitMs / 1000}s...`);
      await sleep(waitMs);
      continue;
    }

    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }
  throw new Error("Max retries exceeded");
}

/**
 * Send a batch of posts+comments to Gemini and extract business recommendations.
 */
async function extractBusinessesFromBatch(
  posts: RawPost[]
): Promise<ExtractedBusiness[]> {
  // Build the prompt with all comments
  const commentBlocks = posts.map((p, i) => {
    const commentText = p.comments
      .map((c) => `  - ${c}`)
      .join("\n");
    return `POST ${i + 1} [search: "${p.searchTerm}"]:\nQuestion: ${p.postText.slice(0, 300)}\nComments:\n${commentText || "  (no comments)"}`;
  }).join("\n\n---\n\n");

  const prompt = `You are extracting business recommendations from Facebook group posts in Westfield, NJ.

Each post below is a question asking for recommendations, followed by comments with answers.

Extract EVERY business, service provider, or professional mentioned in the COMMENTS. Include:
- Business names (e.g., "G. Fried Carpeting", "Tower Electrical")
- Individual service providers by full name (e.g., "Ray Walker", "Dr. Catherine Cunningham")
- Do NOT include the person asking the question
- Do NOT include generic terms like "my plumber" without a name
- Do NOT include product brands (e.g., "CertainTeed") unless they're a service business

For each business, provide:
- name: The business or person's name (clean, properly capitalized)
- category: One of: Electrician, Plumber, HVAC, Landscaper, House Cleaner, Handyman, Painter, Contractor, Roofer, Dentist, Pediatrician, Attorney, Accountant, Caterer, Bartender, Personal Chef, Babysitter, Nanny, Music Teacher, Tutor, Realtor, Photographer, Mover, Exterminator, Pool Service, Tree Service, Snow Removal, Gutter Service, Interior Designer, Auto Mechanic, Flooring, Doctor, Other
- phone: Phone number if mentioned (or empty string)
- website: Website URL if mentioned (or empty string, exclude facebook.com)
- email: Email if mentioned (or empty string)
- recommendedBy: Array of names of people who recommended this business

Respond with ONLY a minified JSON array (no newlines, no pretty-printing). No markdown, no explanation. Example:
[{"name":"G. Fried Carpeting","category":"Flooring","phone":"","website":"","email":"","recommendedBy":["Karin Murphy Engel"]}]

If no businesses are found, respond with: []

POSTS:

${commentBlocks}`;

  const response = await callGemini(prompt);

  // Parse JSON from response
  try {
    // Strip markdown code fences and any thinking/preamble text
    let cleaned = response;
    // Remove markdown fences
    cleaned = cleaned.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    // Extract JSON array — find first '[' to last ']'
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start !== -1 && end !== -1 && end > start) {
      cleaned = cleaned.slice(start, end + 1);
    }
    const parsed = JSON.parse(cleaned.trim());
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    console.error("  Failed to parse Gemini response:", response.slice(0, 200));
    return [];
  }
}

async function main() {
  const rawPath = path.join(__dirname, "raw-posts.json");
  if (!fs.existsSync(rawPath)) {
    console.error("❌ raw-posts.json not found. Run scrape-fb.ts first.");
    process.exit(1);
  }

  const posts: RawPost[] = JSON.parse(fs.readFileSync(rawPath, "utf-8"));
  const postsWithComments = posts.filter((p) => p.comments.length > 0);
  const totalComments = posts.reduce((s, p) => s + p.comments.length, 0);
  console.log(`📄 Loaded ${posts.length} posts (${postsWithComments.length} with comments, ${totalComments} total comments)\n`);

  // Process in batches of 5 posts to stay within token limits
  const BATCH_SIZE = 5;
  const allExtracted: ExtractedBusiness[] = [];
  const batches = [];

  for (let i = 0; i < postsWithComments.length; i += BATCH_SIZE) {
    batches.push(postsWithComments.slice(i, i + BATCH_SIZE));
  }

  console.log(`Processing ${batches.length} batches...\n`);

  // Process sequentially to avoid rate limits
  const CONCURRENCY = 1;
  let completed = 0;

  async function processBatch(batch: RawPost[], batchIdx: number) {
    try {
      const results = await extractBusinessesFromBatch(batch);
      allExtracted.push(...results);
      completed++;
      const terms = [...new Set(batch.map((p) => p.searchTerm))].join(", ");
      process.stdout.write(`  ✅ Batch ${batchIdx + 1}/${batches.length} [${terms}]: ${results.length} businesses\n`);
    } catch (err) {
      completed++;
      console.error(`  ❌ Batch ${batchIdx + 1} failed:`, (err as Error).message.slice(0, 100));
    }
  }

  // Run sequentially with delay between batches
  for (const [idx, batch] of batches.entries()) {
    await processBatch(batch, idx);
    // Brief pause between batches
    if (idx < batches.length - 1) {
      await sleep(1000);
    }
  }

  console.log(`\n📊 Raw extraction: ${allExtracted.length} business mentions\n`);

  // Deduplicate by normalized name
  const businessMap = new Map<string, Business>();

  for (const ext of allExtracted) {
    if (!ext.name || ext.name.length < 2) continue;

    const key = ext.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    if (key.length < 2) continue;

    if (businessMap.has(key)) {
      const existing = businessMap.get(key)!;
      existing.recommendations++;
      // Merge contact info
      if (!existing.phone && ext.phone) existing.phone = ext.phone;
      if (!existing.website && ext.website) existing.website = ext.website;
      if (!existing.email && ext.email) existing.email = ext.email;
      // Merge recommenders
      for (const r of ext.recommendedBy || []) {
        if (r && !existing.recommendedBy.includes(r)) {
          existing.recommendedBy.push(r);
        }
      }
    } else {
      businessMap.set(key, {
        name: ext.name,
        category: ext.category || "Other",
        phone: ext.phone || "",
        email: ext.email || "",
        address: "Westfield, NJ",
        website: ext.website || "",
        recommendations: 1,
        recommendedBy: (ext.recommendedBy || []).filter(Boolean),
        mentions: [],
      });
    }
  }

  // Sort by recommendations
  const businesses = Array.from(businessMap.values()).sort(
    (a, b) => b.recommendations - a.recommendations
  );

  console.log(`🏢 Deduplicated to ${businesses.length} unique businesses:\n`);
  for (const biz of businesses) {
    const recs = biz.recommendedBy.slice(0, 3).join(", ");
    const contact = [biz.phone, biz.website, biz.email].filter(Boolean).join(" | ");
    console.log(
      `  ${biz.name} (${biz.category}) — ${biz.recommendations} rec${biz.recommendations > 1 ? "s" : ""}${recs ? ` [${recs}]` : ""}${contact ? ` ${contact}` : ""}`
    );
  }

  // Save review version
  const reviewPath = path.join(__dirname, "businesses-review.json");
  fs.writeFileSync(reviewPath, JSON.stringify(businesses, null, 2));
  console.log(`\n📝 Review: ${reviewPath}`);

  // Save clean version
  const cleanBusinesses = businesses.map(({ mentions, ...rest }) => rest);
  const outDir = path.join(__dirname, "..", "src", "data");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "scraped-businesses.json");
  fs.writeFileSync(outPath, JSON.stringify(cleanBusinesses, null, 2));
  console.log(`✅ Output: ${outPath}`);
}

main().catch((err) => {
  console.error("Parse failed:", err);
  process.exit(1);
});
