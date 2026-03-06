/**
 * Parse raw Facebook posts into structured business data
 *
 * Usage:
 *   npx tsx scripts/parse-posts.ts
 *
 * Input:  scripts/raw-posts.json (from scrape-fb.ts v6)
 * Output: src/data/scraped-businesses.json
 *         scripts/businesses-review.json (with mentions for human review)
 *
 * This script extracts business names from COMMENTS (where the actual
 * recommendations live), deduplicates, and outputs data matching the
 * seed-businesses.json schema.
 */

import * as fs from "fs";
import * as path from "path";

interface RawPost {
  group: string;
  searchTerm: string;
  postText: string;
  comments: string[];
  postUrl: string;
  timestamp: string;
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

// Category keywords mapping — expanded per user feedback
// Excludes therapists, chiropractors, dermatologists
const CATEGORY_PATTERNS: Record<string, RegExp> = {
  Electrician: /\b(electric(ian|al)?|wiring)\b/i,
  Plumber: /\b(plumb(er|ing))\b/i,
  HVAC: /\b(hvac|heating|cooling|air condition(ing)?|furnace)\b/i,
  Landscaper: /\b(landscap(er|ing)|lawn|yard|garden|mow(ing)?)\b/i,
  "House Cleaner": /\b(clean(er|ing)|maid|housekeep)\b/i,
  Handyman: /\b(handyman|handy ?man|fix.?it|odd jobs)\b/i,
  Painter: /\b(paint(er|ing))\b/i,
  Contractor: /\b(contractor|renovation|remodel|construction|GC|general contractor)\b/i,
  Roofer: /\b(roof(er|ing))\b/i,
  Dentist: /\b(dentist|dental|orthodont)\b/i,
  Pediatrician: /\b(pediatri(cian|c)|kids?.?doctor)\b/i,
  Attorney: /\b(attorney|lawyer|legal|law firm)\b/i,
  Accountant: /\b(accountant|CPA|tax prep|bookkeep)\b/i,
  Caterer: /\b(cater(er|ing)|food service)\b/i,
  Bartender: /\b(bartend(er|ing)|mixologist)\b/i,
  "Personal Chef": /\b(personal chef|private chef)\b/i,
  Babysitter: /\b(babysit(ter|ting)|child ?care)\b/i,
  Nanny: /\b(nanny|au pair)\b/i,
  "Music Teacher": /\b(music (lesson|teacher|instructor)|piano|guitar|violin|drum)\b/i,
  Tutor: /\b(tutor(ing)?|test prep|SAT|ACT)\b/i,
  Realtor: /\b(realtor|real estate|real ?estate agent)\b/i,
  Photographer: /\b(photograph(er|y)|photo shoot)\b/i,
  Mover: /\b(mov(er|ing)|relocation)\b/i,
  Exterminator: /\b(exterminator|pest control|termite|bug)\b/i,
  "Pool Service": /\b(pool (service|cleaning|maintenance)|pool guy)\b/i,
  "Tree Service": /\b(tree (removal|service|trimming|cutting)|arborist)\b/i,
  "Snow Removal": /\b(snow (plow|removal|blowing)|plow(ing)?)\b/i,
  "Gutter Service": /\b(gutter(s)?( cleaning| installation| repair)?)\b/i,
  "Interior Designer": /\b(interior design(er)?|home stag(er|ing))\b/i,
  "Auto Mechanic": /\b(mechanic|auto.?repair|car repair)\b/i,
  Flooring: /\b(floor(ing)?|carpet(s|ing)?|hardwood|tile)\b/i,
};

// Phone number pattern
const PHONE_RE = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
// Email pattern
const EMAIL_RE = /\b[\w.-]+@[\w.-]+\.\w{2,}\b/;
// URL pattern (excluding facebook.com)
const URL_RE = /\bhttps?:\/\/[\w.-]+\.\w{2,}[^\s)"]*/i;

function inferCategory(text: string, searchTerm: string): string {
  // First try to match from the text itself
  for (const [category, pattern] of Object.entries(CATEGORY_PATTERNS)) {
    if (pattern.test(text)) return category;
  }
  // Fall back to the search term
  for (const [category, pattern] of Object.entries(CATEGORY_PATTERNS)) {
    if (pattern.test(searchTerm)) return category;
  }
  return "Other";
}

function extractPhone(text: string): string {
  const match = text.match(PHONE_RE);
  return match ? match[0] : "";
}

function extractEmail(text: string): string {
  const match = text.match(EMAIL_RE);
  return match ? match[0] : "";
}

function extractWebsite(text: string): string {
  const match = text.match(URL_RE);
  if (!match) return "";
  if (match[0].includes("facebook.com")) return "";
  return match[0];
}

/**
 * Extract business names from comment or post text.
 *
 * Looks for:
 * - "I recommend [Name]", "we used [Name]", "try [Name]", etc.
 * - "[Name] did a great job", "[Name] is awesome", etc.
 * - Capitalized multi-word sequences that look like business names
 * - Names followed by contact info (phone, URL)
 */
function extractBusinessNames(text: string): string[] {
  const names: string[] = [];

  // Pattern 1: recommendation verbs + Name
  const recVerbs = /(?:recommend|suggest|used|use|try|call|hired|using|love|like|went to|go to|check out)\s+([A-Z][A-Za-z'&.]+(?:\s+[A-Z&.][A-Za-z'&.]*){0,4})/g;
  let match;
  while ((match = recVerbs.exec(text)) !== null) {
    const name = match[1].trim();
    if (name.length > 3 && !isCommonPhrase(name)) names.push(name);
  }

  // Pattern 2: Name + positive descriptors
  const nameFirst = /([A-Z][A-Za-z'&.]+(?:\s+[A-Z&.][A-Za-z'&.]*){1,4})\s+(?:is great|is awesome|does great|did a great|did amazing|are the best|was fantastic|highly recommend|is the best|are awesome|is excellent|was great|was amazing|did an amazing|did wonderful)/g;
  while ((match = nameFirst.exec(text)) !== null) {
    const name = match[1].trim();
    if (name.length > 3 && !isCommonPhrase(name)) names.push(name);
  }

  // Pattern 3: Name followed by phone number or URL (strong signal)
  const nameContact = /([A-Z][A-Za-z'&.]+(?:\s+[A-Z&.][A-Za-z'&.]*){0,3})\s*[-–—]?\s*\(?\d{3}\)?[-.\s]?\d{3}/g;
  while ((match = nameContact.exec(text)) !== null) {
    const name = match[1].trim();
    if (name.length > 3 && !isCommonPhrase(name)) names.push(name);
  }

  return [...new Set(names)];
}

const COMMON_PHRASES = new Set([
  "The", "This", "That", "They", "Their", "There", "These", "Those",
  "What", "When", "Where", "Which", "While", "Would", "Will",
  "Anyone", "Someone", "Everyone", "Looking", "Does", "Have",
  "Just", "Also", "Very", "Really", "Great", "Good", "Best",
  "Facebook", "Westfield", "New Jersey", "Not", "But", "And",
  "My", "Our", "Your", "His", "Her", "Its", "We", "You",
  "I've", "I'm", "He", "She", "One", "All", "Any",
  "How", "Why", "Can", "Could", "Should", "Been",
  "Yes", "No", "Thanks", "Thank", "Please",
  "Many", "Much", "Most", "Some", "None",
  "South", "North", "East", "West", "Central",
]);

function isCommonPhrase(name: string): boolean {
  const words = name.split(/\s+/);
  if (words.length === 0) return true;
  // Single common word
  if (words.length === 1 && COMMON_PHRASES.has(name)) return true;
  // First word is common and it's the only word
  if (words.length === 1) return false;
  // Check if it starts with a common phrase
  if (COMMON_PHRASES.has(words[0])) return true;
  return false;
}

function normalizeBusinessName(name: string): string {
  return name.replace(/\s+/g, " ").replace(/[.,!?]+$/, "").trim();
}

function main() {
  const rawPath = path.join(__dirname, "raw-posts.json");

  if (!fs.existsSync(rawPath)) {
    console.error("❌ raw-posts.json not found. Run scrape-fb.ts first.");
    process.exit(1);
  }

  const posts: RawPost[] = JSON.parse(fs.readFileSync(rawPath, "utf-8"));
  const totalComments = posts.reduce((s, p) => s + p.comments.length, 0);
  console.log(`📄 Loaded ${posts.length} posts with ${totalComments} comments\n`);

  const businessMap = new Map<string, Business>();

  for (const post of posts) {
    const fullContext = post.postText + "\n" + post.comments.join("\n");

    // Process each comment individually (comments are "Name: text" format)
    for (const comment of post.comments) {
      // Split "Commenter Name: comment text"
      const colonIdx = comment.indexOf(":");
      let recommenderName = "";
      let commentText = comment;

      if (colonIdx > 0 && colonIdx < 50) {
        recommenderName = comment.slice(0, colonIdx).trim();
        commentText = comment.slice(colonIdx + 1).trim();
      }

      const names = extractBusinessNames(commentText);
      const category = inferCategory(fullContext, post.searchTerm);
      const phone = extractPhone(commentText);
      const email = extractEmail(commentText);
      const website = extractWebsite(commentText);

      for (const rawName of names) {
        const name = normalizeBusinessName(rawName);
        const key = name.toLowerCase();

        if (businessMap.has(key)) {
          const existing = businessMap.get(key)!;
          existing.recommendations++;
          existing.mentions.push(commentText.slice(0, 200));
          if (recommenderName && !existing.recommendedBy.includes(recommenderName)) {
            existing.recommendedBy.push(recommenderName);
          }
          if (!existing.phone && phone) existing.phone = phone;
          if (!existing.email && email) existing.email = email;
          if (!existing.website && website) existing.website = website;
        } else {
          businessMap.set(key, {
            name,
            category,
            phone,
            email,
            address: "Westfield, NJ",
            website,
            recommendations: 1,
            recommendedBy: recommenderName ? [recommenderName] : [],
            mentions: [commentText.slice(0, 200)],
          });
        }
      }
    }

    // Also check the post text itself for recommendations (less common)
    if (post.postText.length > 30) {
      const postNames = extractBusinessNames(post.postText);
      const category = inferCategory(post.postText, post.searchTerm);

      for (const rawName of postNames) {
        const name = normalizeBusinessName(rawName);
        const key = name.toLowerCase();
        if (!businessMap.has(key)) {
          businessMap.set(key, {
            name,
            category,
            phone: extractPhone(post.postText),
            email: extractEmail(post.postText),
            address: "Westfield, NJ",
            website: extractWebsite(post.postText),
            recommendations: 1,
            recommendedBy: [],
            mentions: [post.postText.slice(0, 200)],
          });
        }
      }
    }
  }

  // Sort by recommendations (most mentioned first)
  const businesses = Array.from(businessMap.values()).sort(
    (a, b) => b.recommendations - a.recommendations
  );

  console.log(`🏢 Extracted ${businesses.length} businesses:\n`);
  for (const biz of businesses.slice(0, 40)) {
    const recs = biz.recommendedBy.slice(0, 3).join(", ");
    console.log(
      `  ${biz.name} (${biz.category}) — ${biz.recommendations} mention${biz.recommendations > 1 ? "s" : ""}${recs ? ` [${recs}]` : ""}`
    );
  }
  if (businesses.length > 40) {
    console.log(`  ... and ${businesses.length - 40} more`);
  }

  // Save review version (with mentions + recommendedBy for human review)
  const reviewPath = path.join(__dirname, "businesses-review.json");
  fs.writeFileSync(reviewPath, JSON.stringify(businesses, null, 2));
  console.log(`\n📝 Review file: ${reviewPath}`);

  // Save clean version (without mentions, matching seed schema)
  const cleanBusinesses = businesses.map(({ mentions, recommendedBy, ...rest }) => ({
    ...rest,
    recommendedBy: recommendedBy.slice(0, 5), // keep top 5 recommenders
  }));
  const outDir = path.join(__dirname, "..", "src", "data");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "scraped-businesses.json");
  fs.writeFileSync(outPath, JSON.stringify(cleanBusinesses, null, 2));
  console.log(`✅ Output: ${outPath}`);
  console.log(`\nReview businesses-review.json, edit scraped-businesses.json as needed, then:`);
  console.log(`  npx tsx scripts/clear.ts --seeded-only`);
  console.log(`  npx tsx scripts/seed.ts  (after updating import path)`);
}

main();
