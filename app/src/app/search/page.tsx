import type { Metadata } from "next";
import SearchExperience from "@/components/search/SearchExperience";

export const metadata: Metadata = {
  title: "Find local events",
  description: "Describe what you want to do near Westfield and find source-backed local events.",
};

export default function SearchPage() {
  return <SearchExperience />;
}
