import Link from "next/link";
import type { Service } from "@/lib/firestore";

function mapsUrl(address: string) {
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
}

export default function ServiceCard({ service }: { service: Service }) {
  return (
    <Link
      href={`/directory/${service.id}`}
      className="block rounded-[10px] border border-black/6 bg-paper-pure p-6 no-underline transition-all hover:shadow-md hover:-translate-y-0.5"
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <h3
          className="text-[1.1rem]"
          style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--ink)" }}
        >
          {service.name}
        </h3>
        <span className="ml-2 shrink-0 rounded-full px-2.5 py-0.5 text-[0.75rem] font-semibold text-ink-muted" style={{ background: "var(--paper-dark)" }}>
          {service.category}
        </span>
      </div>

      {service.address && (
        <p
          className="mb-2 flex items-center gap-1.5 text-[0.88rem] text-ink-muted"
          onClick={(e) => {
            e.preventDefault();
            window.open(mapsUrl(service.address), "_blank");
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-60">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span className="hover:underline">{service.address}</span>
        </p>
      )}

      <div className="flex items-center gap-4 text-[0.88rem] text-ink-light">
        {service.phone && <span>{service.phone}</span>}
        {service.recommendations > 0 && (
          <span className="text-[0.9rem] font-semibold" style={{ color: "var(--accent)" }}>
            {service.recommendations} recommendation{service.recommendations !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {service.recentRecommenders?.length > 0 && (
        <p className="mt-2.5 text-[0.84rem] text-ink-muted">
          Recommended by{" "}
          {service.recentRecommenders
            .slice(0, 3)
            .map((r) => (typeof r === "string" ? r.split(" ")[0] : (r.displayName?.split(" ")[0] || "a neighbor")))
            .join(", ")}
          {service.recentRecommenders.length > 3 &&
            ` + ${service.recentRecommenders.length - 3} more`}
        </p>
      )}
    </Link>
  );
}
