import Link from "next/link";

const CATEGORIES = [
  { icon: "\u26A1", name: "Electrician", count: 12 },
  { icon: "\uD83D\uDEBF", name: "Plumber", count: 8 },
  { icon: "\u2744\uFE0F", name: "HVAC", count: 6 },
  { icon: "\uD83C\uDF3F", name: "Landscaper", count: 15 },
  { icon: "\uD83C\uDFE0", name: "House Cleaner", count: 10 },
  { icon: "\uD83D\uDD28", name: "Handyman", count: 9 },
  { icon: "\uD83C\uDFA8", name: "Painter", count: 7 },
  { icon: "\uD83D\uDCDA", name: "Tutor", count: 11 },
  { icon: "\uD83C\uDFD7\uFE0F", name: "Contractor", count: 5 },
  { icon: "\uD83D\uDE97", name: "Auto Mechanic", count: 4 },
];

const CATEGORY_PILLS = [
  "Electrician",
  "Plumber",
  "HVAC",
  "Landscaper",
  "Tutor",
  "Handyman",
  "Painter",
  "House Cleaner",
  "Contractor",
  "Auto Mechanic",
];

const EVENTS = [
  {
    date: "Saturday, March 15",
    name: "Westfield Farmers Market",
    location: "South Ave Train Station \u00B7 9am\u20132pm",
  },
  {
    date: "Saturday, March 22",
    name: "Downtown Jazz Night",
    location: "Elm Street \u00B7 7pm\u201310pm",
  },
  {
    date: "Saturday, April 12",
    name: "Spring Street Fair",
    location: "Downtown Westfield \u00B7 All Day",
  },
];

const TESTIMONIALS = [
  {
    text: "\u201CFound an incredible electrician through Westfield Buzz. Three neighbors had recommended him \u2014 that\u2019s all I needed to hear.\u201D",
    author: "Sarah M.",
    area: "Brightwood",
  },
  {
    text: "\u201CSo much better than Yelp. These are actual people I know recommending businesses they\u2019ve actually used.\u201D",
    author: "James K.",
    area: "Wychwood",
  },
  {
    text: "\u201CI run a small landscaping business and the leads from Buzz are the best I\u2019ve ever gotten. People call already trusting you.\u201D",
    author: "Mike R.",
    area: "Service Provider",
  },
];

export default function Home() {
  return (
    <>
      {/* HERO */}
      <section className="mx-auto max-w-[1100px] px-12 pt-10 pb-[60px] max-md:px-6">
        {/* Dateline rule */}
        <div className="mb-4 flex items-center gap-1">
          <div className="h-px flex-1 bg-ink/15" />
          <div className="whitespace-nowrap px-4 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-ink-muted">
            Westfield, New Jersey &middot; Est. 1720 &middot; Great American Main Street
          </div>
          <div className="h-px flex-1 bg-ink/15" />
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
            <div className="relative max-w-[440px]">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[0.95rem] text-ink-muted">
                &#x1F50D;
              </span>
              <input
                type="text"
                placeholder="Search electricians, plumbers, tutors..."
                className="w-full rounded-lg border border-black/12 bg-paper-pure px-5 py-3.5 pl-11 text-[0.95rem] text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent"
                style={{ fontFamily: "var(--font-body)" }}
              />
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-black/6 shadow-lg max-md:order-first">
            <img
              src="/hero-v2-editorial.jpg"
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
            className="rounded-full border border-black/10 px-4 py-1.5 text-[0.8rem] font-medium text-ink-light no-underline transition-all hover:border-accent hover:text-accent hover:bg-accent/4"
          >
            {cat}
          </Link>
        ))}
      </div>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-[1100px] px-12 py-20 max-md:px-6">
        <div
          className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.15em]"
          style={{ color: "var(--accent)" }}
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
      <section className="border-t border-b border-black/6 bg-paper-pure px-12 py-20 max-md:px-6">
        <div className="mx-auto max-w-[1100px]">
          <div
            className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.15em]"
            style={{ color: "var(--accent)" }}
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
                <span className="text-[0.72rem] text-ink-muted">
                  {cat.count} providers
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* TRUST / TESTIMONIALS */}
      <section className="mx-auto max-w-[1100px] px-12 py-20 max-md:px-6">
        <div
          className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.15em]"
          style={{ color: "var(--accent)" }}
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
          Real people. Real recommendations.
        </h2>
        <div className="grid grid-cols-[280px_1fr] items-start gap-12 max-md:grid-cols-1">
          {/* Stats */}
          <div className="sticky top-[100px] max-md:static">
            {[
              { num: "240+", label: "Community Members" },
              { num: "85", label: "Verified Providers" },
              { num: "520+", label: "Recommendations" },
            ].map((stat, i) => (
              <div
                key={stat.label}
                className={`mb-8 pb-8 ${i < 2 ? "border-b border-black/6" : ""}`}
              >
                <div
                  className="mb-1 text-[3rem] leading-none"
                  style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
                >
                  {stat.num}
                </div>
                <div className="text-[0.82rem] font-medium text-ink-muted">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* Testimonials */}
          <div className="flex flex-col gap-6">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.author}
                className="rounded-[10px] border border-black/6 bg-paper-pure p-8"
              >
                <p
                  className="mb-4 text-[1.15rem] italic leading-relaxed"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 400,
                    color: "var(--ink)",
                  }}
                >
                  {t.text}
                </p>
                <div className="text-[0.82rem] font-semibold text-ink-light">
                  {t.author}{" "}
                  <span className="font-normal text-ink-muted">
                    &middot; {t.area}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* EVENTS */}
      <section className="px-12 py-20 max-md:px-6" style={{ background: "var(--ink)" }}>
        <div className="mx-auto max-w-[1100px]">
          <div
            className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.15em]"
            style={{ color: "var(--accent-light)" }}
          >
            What&apos;s Happening
          </div>
          <h2
            className="mb-12"
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
          <div className="grid grid-cols-3 gap-6 max-md:grid-cols-1">
            {EVENTS.map((evt) => (
              <div
                key={evt.name}
                className="cursor-pointer rounded-[10px] border border-white/8 p-6 transition-all hover:border-white/15 hover:bg-white/3"
              >
                <div
                  className="mb-2 text-[0.85rem]"
                  style={{
                    fontFamily: "var(--font-display)",
                    color: "var(--accent-light)",
                  }}
                >
                  {evt.date}
                </div>
                <div
                  className="mb-1 text-[1.2rem]"
                  style={{
                    fontFamily: "var(--font-display)",
                    color: "var(--paper)",
                  }}
                >
                  {evt.name}
                </div>
                <div className="text-[0.82rem] text-white/40">{evt.location}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[600px] px-12 py-20 text-center max-md:px-6">
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
