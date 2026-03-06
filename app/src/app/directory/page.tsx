"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { getServices, getCategories, type Service } from "@/lib/firestore";
import { searchServices } from "@/lib/search";
import ServiceCard from "@/components/ServiceCard";
import SearchBar from "@/components/SearchBar";
import CategoryGrid from "@/components/CategoryGrid";
import AuthGate from "@/components/AuthGate";

function DirectoryContent() {
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("category") || "";

  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [servicesData, categoriesData] = await Promise.all([
          getServices(categoryParam || undefined),
          getCategories(),
        ]);
        setServices(servicesData);
        setCategories(categoriesData);
      } catch (err) {
        console.error("Failed to load directory:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [categoryParam]);

  const displayedServices = searchQuery
    ? searchServices(services, searchQuery)
    : services;

  return (
    <div className="mx-auto max-w-[1100px] px-12 py-12 max-md:px-6">
      <div
        className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.15em]"
        style={{ color: "var(--accent)" }}
      >
        Directory
      </div>
      <h1
        className="mb-8"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)",
          fontWeight: 400,
          color: "var(--ink)",
        }}
      >
        {categoryParam || "All Providers"}
      </h1>

      <div className="mb-6">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search providers by name, category..."
        />
      </div>

      <div className="mb-8">
        <CategoryGrid categories={categories} activeCategory={categoryParam} />
      </div>

      {loading ? (
        <div className="py-12 text-center text-[0.9rem] text-ink-muted">
          Loading providers...
        </div>
      ) : displayedServices.length === 0 ? (
        <div className="py-12 text-center text-[0.9rem] text-ink-muted">
          No providers found.{" "}
          {searchQuery && "Try a different search term."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          {displayedServices.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DirectoryPage() {
  return (
    <AuthGate>
      <Suspense
        fallback={
          <div className="mx-auto max-w-[1100px] px-12 py-12 text-center text-ink-muted">
            Loading directory...
          </div>
        }
      >
        <DirectoryContent />
      </Suspense>
    </AuthGate>
  );
}
