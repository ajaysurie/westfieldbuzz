export const EVENT_CATEGORY_IMAGES: Record<string, string> = {
  "Sports & Recreation": "/event-cats/sports.png",
  Sports: "/event-cats/sports.png",
  "Food & Drink": "/event-cats/food.png",
  "Family & Kids": "/event-cats/family.png",
  Family: "/event-cats/family.png",
  "Arts & Culture": "/event-cats/arts.png",
  Arts: "/event-cats/arts.png",
  Music: "/event-cats/music.png",
  Community: "/event-cats/community.png",
  "Health & Wellness": "/event-cats/health.png",
  Health: "/event-cats/health.png",
  Entertainment: "/event-cats/entertainment.png",
  History: "/event-cats/history.png",
  Markets: "/event-cats/market.png",
  Market: "/event-cats/market.png",
};

export function eventCategoryImage(category: string | undefined): string {
  return EVENT_CATEGORY_IMAGES[category ?? ""] ?? "/event-cats/community.png";
}

export const EVENT_CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  "Sports & Recreation": { bg: "#dbeafe", text: "#1e40af" },
  "Sports":        { bg: "#dbeafe", text: "#1e40af" },
  "Food & Drink":  { bg: "#fef3c7", text: "#92400e" },
  "Family & Kids": { bg: "#dcfce7", text: "#166534" },
  "Family":        { bg: "#dcfce7", text: "#166534" },
  "Arts & Culture": { bg: "#f3e8ff", text: "#6b21a8" },
  "Arts":          { bg: "#f3e8ff", text: "#6b21a8" },
  "Music":         { bg: "#fce7f3", text: "#9d174d" },
  "Community":     { bg: "#e0f2fe", text: "#075985" },
  "Health & Wellness": { bg: "#d1fae5", text: "#065f46" },
  "Health":        { bg: "#d1fae5", text: "#065f46" },
  "Entertainment": { bg: "#ffe4e6", text: "#9f1239" },
  "History":       { bg: "#fef9c3", text: "#854d0e" },
  "Markets":       { bg: "#fed7aa", text: "#9a3412" },
  "Market":        { bg: "#fed7aa", text: "#9a3412" },
};
