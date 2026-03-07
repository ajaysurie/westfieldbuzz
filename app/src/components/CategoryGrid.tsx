"use client";

import Link from "next/link";

const CATEGORY_ICONS: Record<string, string> = {
  Accountant: "📊",
  Attorney: "⚖️",
  "Auto Mechanic": "🚗",
  Caterer: "🍽️",
  Contractor: "🏗️",
  Dentist: "🦷",
  Doctor: "🩺",
  Electrician: "⚡",
  Exterminator: "🐛",
  Flooring: "🪵",
  "Gutter Service": "🪣",
  Handyman: "🔨",
  "House Cleaner": "🏠",
  HVAC: "❄️",
  "Interior Designer": "🛋️",
  Landscaper: "🌿",
  Mover: "📦",
  "Music Teacher": "🎵",
  Nanny: "👶",
  Other: "✨",
  Painter: "🎨",
  Pediatrician: "🏥",
  Photographer: "📷",
  Plumber: "🚿",
  "Pool Service": "🏊",
  Realtor: "🏡",
  Roofer: "🪜",
  "Snow Removal": "☃️",
  "Tree Service": "🌳",
  Tutor: "📚",
};

interface CategoryGridProps {
  categories: string[];
  activeCategory?: string;
}

export default function CategoryGrid({ categories, activeCategory }: CategoryGridProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href="/directory"
        className={`rounded-full border px-4 py-1.5 text-[0.8rem] font-medium no-underline transition-all ${
          !activeCategory
            ? "border-accent bg-accent/10 text-accent"
            : "border-black/10 text-ink-light hover:border-accent hover:text-accent"
        }`}
      >
        All
      </Link>
      {categories.map((cat) => (
        <Link
          key={cat}
          href={`/directory?category=${encodeURIComponent(cat)}`}
          className={`rounded-full border px-4 py-1.5 text-[0.8rem] font-medium no-underline transition-all ${
            activeCategory === cat
              ? "border-accent bg-accent/10 text-accent"
              : "border-black/10 text-ink-light hover:border-accent hover:text-accent"
          }`}
        >
          {CATEGORY_ICONS[cat] || ""} {cat}
        </Link>
      ))}
    </div>
  );
}
