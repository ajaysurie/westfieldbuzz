import Image from "next/image";
import Link from "next/link";
import type { EventSearchSuccess } from "@/lib/search/search-contract";
import type { SearchableEvent } from "@/lib/search/event-retrieval";

const CATEGORY_IMAGES: Record<string, string> = {
  "Family & Kids": "/event-cats/family.png",
  "Arts & Culture": "/event-cats/arts.png",
  "Sports & Recreation": "/event-cats/sports.png",
  Music: "/event-cats/music.png",
  "Food & Drink": "/event-cats/food.png",
  Community: "/event-cats/community.png",
  "Health & Wellness": "/event-cats/health.png",
  Entertainment: "/event-cats/entertainment.png",
  History: "/event-cats/history.png",
  Markets: "/event-cats/market.png",
};

function formatDateTime(event: SearchableEvent): string {
  const start = new Date(event.date);
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(start);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(start);
  return `${date} · ${time}`;
}
function costLabel(event: SearchableEvent): string | null {
  if (event.isFree) return "Free";
  if (event.costAmount == null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Number.isInteger(event.costAmount) ? 0 : 2,
  }).format(event.costAmount);
}

function ageLabel(event: SearchableEvent): string | null {
  if (event.minAge != null && event.maxAge != null) return `Ages ${event.minAge}–${event.maxAge}`;
  if (event.minAge != null) return `Ages ${event.minAge}+`;
  if (event.maxAge != null) return `Up to age ${event.maxAge}`;
  return null;
}

function verifiedLabel(value: string): string {
  const date = new Date(value);
  return `Verified ${new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  }).format(date)}`;
}

export default function SearchResults({ result }: { result: EventSearchSuccess }) {
  if (!result.results.length) {
    return (
      <section className="rounded-2xl border border-black/8 bg-white px-6 py-10 text-center shadow-sm">
        <h2 className="font-[family-name:var(--font-display)] text-3xl text-ink">No exact matches yet</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-ink-light">The inventory has no event that safely meets every interpreted constraint. Nothing has been invented to fill the gap.</p>
        <ul className="mx-auto mt-5 grid max-w-md gap-2 text-left text-sm text-ink-light">
          {result.suggestions.map((suggestion) => <li key={suggestion}>• {suggestion}</li>)}
        </ul>
        <Link href="/events" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-bold text-white no-underline">Browse the calendar</Link>
      </section>
    );
  }

  return (
    <div className="grid gap-4">
      {result.results.map(({ event, rank, label, reason }) => {
        const facts = [formatDateTime(event), event.town, costLabel(event), ageLabel(event)].filter(Boolean);
        return (
          <article key={event.id} className="grid min-h-[204px] grid-cols-[145px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-black/8 bg-white transition hover:-translate-y-0.5 hover:shadow-md max-sm:grid-cols-[98px_minmax(0,1fr)]">
            <div className="relative min-h-full overflow-hidden bg-paper-dark">
              <Image src={CATEGORY_IMAGES[event.category] ?? "/event-cats/community.png"} alt="" fill className="object-cover saturate-75" sizes="145px" />
              <span className="absolute left-3 top-3 grid size-8 place-items-center rounded-full bg-white/95 font-[family-name:var(--font-display)] text-lg text-accent shadow-sm">{rank}</span>
            </div>
            <div className="min-w-0 p-5 max-sm:p-3.5">
              <div className="mb-2 flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-wider text-sage"><span className="size-2 rounded-full bg-sage shadow-[0_0_0_4px_rgba(107,127,94,.13)]" />{label}</div>
              <h2 className="font-[family-name:var(--font-display)] text-2xl leading-tight text-ink max-sm:text-xl">{event.title}</h2>
              <p className="mt-1 text-xs text-ink-light">{facts.join(" · ")}</p>
              <p className="my-3 text-sm leading-relaxed text-ink-light max-sm:text-xs">{reason}</p>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[0.68rem] text-ink-muted"><strong className="text-sage">✓ {verifiedLabel(event.lastVerifiedAt)}</strong></span>
                <Link href={`/events/${encodeURIComponent(event.id)}`} className="inline-flex min-h-10 items-center rounded-lg bg-accent px-3 text-xs font-bold text-white no-underline">View event</Link>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
