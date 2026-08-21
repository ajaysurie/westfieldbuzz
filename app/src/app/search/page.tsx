import type { Metadata } from "next";
import SearchExperience from "@/components/search/SearchExperience";

export const metadata: Metadata = {
  title: "Find local events",
  description: "Describe what you want to do near Westfield and find source-backed local events.",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  return <SearchExperience initialQuery={q.slice(0, 400)} />;
}
