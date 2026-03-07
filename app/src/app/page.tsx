"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCommunityStats, getEvents, type Event } from "@/lib/firestore";
import EventCard from "@/components/EventCard";

const CATEGORIES = [
  { icon: "\u26A1", name: "Electrician" },
  { icon: "\uD83D\uDEBF", name: "Plumber" },
  { icon: "\u2744\uFE0F", name: "HVAC" },
  { icon: "\uD83C\uDF3F", name: "Landscaper" },
  { icon: "\uD83C\uDFE0", name: "House Cleaner" },
  { icon: "\uD83D\uDD28", name: "Handyman" },
  { icon: "\uD83C\uDFA8", name: "Painter" },
  { icon: "\uD83D\uDCDA", name: "Tutor" },
  { icon: "\uD83C\uDFD7\uFE0F", name: "Contractor" },
  { icon: "\uD83D\uDE97", name: "Auto Mechanic" },
];

const CATEGORY_PILLS = [
  "Electrician",
  "Plumber",
  "Landscaper",
  "Handyman",
  "Tutor",
  "House Cleaner",
];

export default function Home() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState({ providers: 0, recommendations: 0, recommenders: 0 });
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    getCommunityStats().then(setStats);
    getEvents().then((evts) => {
      // Show next 3 upcoming events
      const now = new Date();
      const upcoming = evts.filter((e) => {
        const d = e.date?.toDate ? e.date.toDate() : new Date(e.date as unknown as string);
        return d >= now;
      });
      setEvents(upcoming.slice(0, 3));
    });
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/directory?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <>
      {/* HERO */}
      <section className="mx-auto max-w-[1100px] px-12 pt-10 pb-[60px] max-md:px-6">
        {/* Dateline rule */}
        <div className="mb-4 flex items-center gap-1 max-md:justify-center">
          <div className="h-px flex-1 bg-ink/15 max-md:hidden" />
          <div className="px-4 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-ink-muted max-md:text-center">
            Westfield, New Jersey &middot; Est. 1720 &middot; Great American Main Street
          </div>
          <div className="h-px flex-1 bg-ink/15 max-md:hidden" />
        </div>

        {/* Hero layout */}
        <div className="grid grid-cols-2 items-center gap-12 max-md:grid-cols-1">
          <div>
            <h1
              className="mb-6 tracking-[-0.02em]"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(2.8rem, 5vw, 4rem)",
                fontWeight: 400,
                lineHeight: 1.08,
                color: "var(--ink)",
              }}
            >
              The neighbors&apos; guide to{" "}
              <em style={{ color: "var(--accent)" }}>everything local</em>
            </h1>
            <p className="mb-8 max-w-[440px] text-[1.05rem] leading-[1.7] text-ink-light">
              A community-curated directory of Westfield&apos;s most trusted service
              providers. Real recommendations from the people who live here.
            </p>
            <form onSubmit={handleSearch} className="relative max-w-[440px]">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[0.95rem] text-ink-muted">
                &#x1F50D;
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search electricians, plumbers, tutors..."
                className="w-full rounded-lg border border-black/12 bg-paper-pure px-5 py-3.5 pl-11 text-[0.95rem] text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent"
                style={{ fontFamily: "var(--font-body)" }}
              />
            </form>
          </div>
          <div className="overflow-hidden rounded-xl border border-black/6 shadow-lg max-md:order-first">
            <img
              src="/event-cats/westfield-hero.png"
              alt="Watercolor illustration of downtown Westfield"
              className="block w-full"
            />
          </div>
        </div>
      </section>

      {/* CATEGORY STRIP */}
      <div className="flex flex-wrap justify-center gap-2 border-t border-b border-black/8 bg-paper-pure px-12 py-4 max-md:px-6">
        {CATEGORY_PILLS.map((cat) => (
          <Link
            key={cat}
            href={`/directory?category=${encodeURIComponent(cat)}`}
            className="rounded-full border border-black/10 px-4 py-1.5 max-md:py-2 text-[0.8rem] font-medium text-ink-light no-underline transition-all hover:border-accent hover:text-accent hover:bg-accent/4"
          >
            {cat}
          </Link>
        ))}
      </div>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-[1100px] px-12 py-20 max-md:px-6 max-md:py-12">
        <div
          className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.15em]"
          style={{ color: "var(--gold)" }}
        >
          How It Works
        </div>
        <h2
          className="mb-12"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)",
            fontWeight: 400,
            color: "var(--ink)",
            letterSpacing: "-0.01em",
          }}
        >
          Trusted by design
        </h2>
        <div className="grid grid-cols-3 gap-8 max-md:grid-cols-1">
          {[
            {
              num: "01",
              title: "Neighbors recommend",
              desc: "Real Westfield residents share the providers they personally use and trust.",
            },
            {
              num: "02",
              title: "Community verifies",
              desc: "Multiple recommendations from different neighbors build a trust score over time.",
            },
            {
              num: "03",
              title: "You hire with confidence",
              desc: "Browse vetted providers, see who recommended them, and reach out directly.",
            },
          ].map((step) => (
            <div
              key={step.num}
              className="rounded-[10px] border border-black/6 bg-paper-pure p-8 transition-all hover:shadow-md hover:-translate-y-0.5"
            >
              <div
                className="mb-4 text-[2.5rem] leading-none opacity-50"
                style={{
                  fontFamily: "var(--font-display)",
                  color: "var(--accent-light)",
                }}
              >
                {step.num}
              </div>
              <h3
                className="mb-2 text-[1.3rem]"
                style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
              >
                {step.title}
              </h3>
              <p className="text-[0.9rem] leading-relaxed text-ink-light">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CATEGORIES GRID */}
      <section className="border-t border-b border-black/6 bg-paper-pure px-12 py-20 max-md:px-6 max-md:py-12">
        <div className="mx-auto max-w-[1100px]">
          <div
            className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.15em]"
            style={{ color: "var(--gold)" }}
          >
            Browse
          </div>
          <h2
            className="mb-12"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)",
              fontWeight: 400,
              color: "var(--ink)",
              letterSpacing: "-0.01em",
            }}
          >
            Find what you need
          </h2>
          <div className="grid grid-cols-5 gap-px overflow-hidden rounded-[10px] border border-black/6 bg-black/6 max-md:grid-cols-2">
            {CATEGORIES.map((cat) => (
              <Link
                key={cat.name}
                href={`/directory?category=${encodeURIComponent(cat.name)}`}
                className="bg-paper-pure px-6 py-8 text-center text-ink no-underline transition-colors hover:bg-paper"
              >
                <span className="mb-3 block text-[1.8rem]">{cat.icon}</span>
                <span className="mb-1 block text-[0.88rem] font-semibold">
                  {cat.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* COMMUNITY STATS */}
      <section className="mx-auto max-w-[1100px] px-12 py-20 max-md:px-6 max-md:py-12">
        <div
          className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.15em]"
          style={{ color: "var(--gold)" }}
        >
          Community
        </div>
        <h2
          className="mb-12"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)",
            fontWeight: 400,
            color: "var(--ink)",
            letterSpacing: "-0.01em",
          }}
        >
          Your neighborhood, connected.
        </h2>
        <div className="grid grid-cols-3 gap-8 max-md:grid-cols-1">
          {[
            { num: stats.recommenders, label: "Community Members" },
            { num: stats.providers, label: "Local Providers" },
            { num: stats.recommendations, label: "Recommendations" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-[10px] border border-black/6 bg-paper-pure p-8 text-center"
            >
              <div
                className="mb-2 text-[3.5rem] leading-none"
                style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--accent)" }}
              >
                {stat.num > 0 ? stat.num : "\u2014"}
              </div>
              <div className="text-[0.88rem] font-medium text-ink-muted">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* EVENTS */}
      <section className="px-12 py-20 max-md:px-6 max-md:py-12" style={{ background: "var(--ink)" }}>
        <div className="mx-auto max-w-[1100px]">
          <div
            className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.15em]"
            style={{ color: "var(--gold)" }}
          >
            What&apos;s Happening
          </div>
          <div className="mb-12 flex items-end justify-between">
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)",
                fontWeight: 400,
                color: "var(--paper)",
                letterSpacing: "-0.01em",
              }}
            >
              Upcoming in Westfield
            </h2>
            <Link
              href="/events"
              className="text-[0.85rem] font-medium no-underline transition-colors hover:underline"
              style={{ color: "var(--accent-light)" }}
            >
              View all &rarr;
            </Link>
          </div>
          {events.length > 0 ? (
            <div className="grid grid-cols-3 gap-6 max-md:grid-cols-1">
              {events.map((evt) => (
                <EventCard key={evt.id} event={evt} dark />
              ))}
            </div>
          ) : (
            <p className="text-white/40 text-[0.9rem]">Loading events...</p>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[600px] px-12 py-20 text-center max-md:px-6 max-md:py-12">
        <h2
          className="mb-4"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "2.2rem",
            fontWeight: 400,
            color: "var(--ink)",
          }}
        >
          Know a great local business?
        </h2>
        <p className="mb-8 leading-[1.7] text-ink-light">
          Help your neighbors find the best. Recommend a provider you trust and make
          Westfield&apos;s directory even stronger.
        </p>
        <Link
          href="/suggest"
          className="inline-block rounded-lg px-9 py-3.5 text-[0.9rem] font-semibold text-white no-underline transition-all hover:-translate-y-0.5 hover:shadow-lg"
          style={{ background: "var(--accent)" }}
        >
          Recommend a Business
        </Link>
      </section>
    </>
  );
}
