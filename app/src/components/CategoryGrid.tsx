"use client";

import Link from "next/link";

const CATEGORY_ICONS: Record<string, string> = {
  Electrician: "\u26A1",
  Plumber: "\uD83D\uDEBF",
  HVAC: "\u2744\uFE0F",
  Landscaper: "\uD83C\uDF3F",
  "House Cleaner": "\uD83C\uDFE0",
  Handyman: "\uD83D\uDD28",
  Painter: "\uD83C\uDFA8",
  Tutor: "\uD83D\uDCDA",
  Contractor: "\uD83C\uDFD7\uFE0F",
  "Auto Mechanic": "\uD83D\uDE97",
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
