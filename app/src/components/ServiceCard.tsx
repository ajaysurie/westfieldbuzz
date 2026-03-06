import Link from "next/link";
import type { Service } from "@/lib/firestore";

export default function ServiceCard({ service }: { service: Service }) {
  return (
    <Link
      href={`/directory/${service.id}`}
      className="block rounded-[10px] border border-black/6 bg-paper-pure p-6 no-underline transition-all hover:shadow-md hover:-translate-y-0.5"
    >
      <div className="mb-1 flex items-start justify-between">
        <h3
          className="text-[1.05rem]"
          style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--ink)" }}
        >
          {service.name}
        </h3>
        <span className="ml-2 shrink-0 rounded-full px-2.5 py-0.5 text-[0.72rem] font-semibold text-ink-muted" style={{ background: "var(--paper-dark)" }}>
          {service.category}
        </span>
      </div>

      {service.address && (
        <p className="mb-2 text-[0.82rem] text-ink-muted">{service.address}</p>
      )}

      <div className="flex items-center gap-4 text-[0.82rem] text-ink-light">
        {service.phone && <span>{service.phone}</span>}
        {service.recommendations > 0 && (
          <span className="font-semibold" style={{ color: "var(--accent)" }}>
            {service.recommendations} recommendation{service.recommendations !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {service.recentRecommenders?.length > 0 && (
        <p className="mt-2 text-[0.78rem] text-ink-muted">
          Recommended by{" "}
          {service.recentRecommenders
            .slice(0, 3)
            .map((r) => (typeof r === "string" ? r.split(" ")[0] : "a neighbor"))
            .join(", ")}
          {service.recentRecommenders.length > 3 &&
            ` + ${service.recentRecommenders.length - 3} more`}
        </p>
      )}
    </Link>
  );
}
