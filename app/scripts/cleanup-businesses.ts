/**
 * One-time cleanup of scraped-businesses.json
 * Removes utilities, merges duplicates, fixes categories
 */
import * as fs from "fs";
import * as path from "path";

const inPath = path.join(__dirname, "..", "src", "data", "scraped-businesses.json");
const data = JSON.parse(fs.readFileSync(inPath, "utf-8"));

// 1. Remove utilities and non-businesses
const removeNames = new Set([
  "pseg", "fios", "xfinity", "american water", "elizabeth gas",
  "rnd", "f and d disposal", "atlantic health", "smg", "overlook/summit",
  "starlight", "westwood", "priceless", "flair",
  "josh singer", "robert rezvani", "marc aranguren", // self-recommenders
  "jeff yang", "james palughi", "nicholas anthony", // self-recommenders
  "matthew wasserman", // duplicate of Matt Wasserman handyman
  "michael eisenberg", // self-recommender accountant
  "larisa safonov", // self-recommender
  "g lab", // not a business name
  "dilan", // just a first name
  "vali", // just a first name
]);

// 2. Category fixes
const categoryFixes: Record<string, string> = {
  "deegan roofing, siding & gutter company": "Roofer",
  "deegan": "Roofer",
  "pool tables plus": "Mover", // keep as mover, they moved a pool table
  "teen assist": "Mover",
  "kings cleaners": "House Cleaner",
  "cleaning america": "House Cleaner",
  "towne car wash & detail center": "Auto Mechanic",
  "showroom hand car wash": "Auto Mechanic",
  "galossi glass design": "Contractor",
  "claudio overhead doors": "Contractor",
  "danny's doors": "Contractor",
  "jaeger lumber": "Contractor",
  "hildie lazar": "Interior Designer",
  "blindworks": "Interior Designer",
  "dr. walk": "Dentist",
  "westfield pediatric dental group": "Dentist",
  "dr. tim mccabe": "Dentist",
  "dr. chang": "Dentist",
  "ocean orthodontics & pediatrics": "Dentist",
  "dr. aimee": "Dentist",
  "dental family jr": "Dentist",
  "mary flanagan": "Dentist",
  "dr. rosalie matos": "Dentist",
  "hospital for special surgery": "Doctor",
  "new providence family practice": "Doctor",
  "vanguard medical group": "Doctor",
  "b&w window cleaning": "Gutter Service",
  "b&w window cleaning, llc": "Gutter Service",
  "dem solutions": "Contractor",
  "mark drozic": "Contractor",
};

// 3. Merge map: target name -> names to merge into it
const mergeMap: Record<string, string[]> = {
  "rich's plumbing": ["rich's plumbing heating", "rich's plumbing heating & air conditioning inc."],
  "stafford and sons plumbing": ["stafford plumbing"],
  "aaa able plumbing": ["glenn"],
  "brighton air corp": ["brighton air corporation", "daniel ghanime"],
  "ace handyman services of westfield": ["ace handyman services", "certapro painters of mountainside"],
  "b&w window cleaning, llc": ["b&w window cleaning"],
  "rich kruse": ["rich kruses professional painters"],
  "hunter electric": ["jim hunter"],
  "ron pecina": ["classic electric"],
  "deegan roofing, siding & gutter company": ["deegan"],
  "great smiles dentistry": ["great smiles general dentistry"],
  "iler tree services": ["james at iler"],
  "linos hvac": ["linos hvac hvac"],
  "jds hvac service": ["jds"],
  "tnt pest control": ["tom at tnt"],
  "dr. shukla": ["great smiles dentistry"],
};

interface Business {
  name: string;
  category: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  recommendations: number;
  recommendedBy: string[];
}

let businesses: Business[] = data;

// Apply removes
businesses = businesses.filter(b => !removeNames.has(b.name.toLowerCase()));

// Apply category fixes
for (const b of businesses) {
  const fix = categoryFixes[b.name.toLowerCase()];
  if (fix) b.category = fix;
}

// Apply merges
for (const [targetName, sourceNames] of Object.entries(mergeMap)) {
  const target = businesses.find(b => b.name.toLowerCase() === targetName.toLowerCase());
  if (!target) continue;

  const sourceLower = sourceNames.map(s => s.toLowerCase());
  const sources = businesses.filter(b => sourceLower.includes(b.name.toLowerCase()));

  for (const src of sources) {
    target.recommendations += src.recommendations;
    if (!target.phone && src.phone) target.phone = src.phone;
    if (!target.website && src.website) target.website = src.website;
    if (!target.email && src.email) target.email = src.email;
    for (const r of src.recommendedBy || []) {
      if (r && !target.recommendedBy.includes(r)) {
        target.recommendedBy.push(r);
      }
    }
  }

  // Remove merged sources
  businesses = businesses.filter(b => !sourceLower.includes(b.name.toLowerCase()));
}

// Remove remaining noise: "Other" with no contact info and single-word name
businesses = businesses.filter(b => {
  if (b.category !== "Other") return true;
  if (b.phone || b.website || b.email) return true;
  if (b.name.split(" ").length >= 2) return true;
  return false;
});

// Sync recommendation count to actual name list length
for (const b of businesses) {
  b.recommendations = b.recommendedBy.length;
}

// Sort by recommendations desc, then name
businesses.sort((a, b) => b.recommendations - a.recommendations || a.name.localeCompare(b.name));

// Stats
const cats: Record<string, number> = {};
for (const b of businesses) {
  cats[b.category] = (cats[b.category] || 0) + 1;
}
const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);

console.log(`CLEANED: ${businesses.length} businesses\n`);
for (const [cat, count] of sorted) {
  console.log(`  ${cat}: ${count}`);
}

console.log("\nTop recommended (2+ recs):");
for (const b of businesses.filter(b => b.recommendations >= 2)) {
  const contact = [b.phone, b.website].filter(Boolean).join(" | ");
  console.log(`  ${b.name} (${b.category}) - ${b.recommendations} recs${contact ? " - " + contact : ""}`);
}

// Save
fs.writeFileSync(inPath, JSON.stringify(businesses, null, 2));
console.log(`\nSaved ${businesses.length} businesses to ${inPath}`);
