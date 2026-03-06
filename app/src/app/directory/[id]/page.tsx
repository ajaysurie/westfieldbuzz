"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getServiceById, type Service } from "@/lib/firestore";
import RecommendButton from "@/components/RecommendButton";
import RecommenderAvatars from "@/components/RecommenderAvatars";

export default function ServiceDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const data = await getServiceById(id);
      setService(data);
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[800px] px-12 py-16 text-center text-ink-muted max-md:px-6">
        Loading...
      </div>
    );
  }

  if (!service) {
    return (
      <div className="mx-auto max-w-[800px] px-12 py-16 text-center max-md:px-6">
        <h1
          className="mb-4"
          style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", fontWeight: 400 }}
        >
          Provider not found
        </h1>
        <Link href="/directory" className="text-[0.9rem] font-medium" style={{ color: "var(--accent)" }}>
          Back to Directory
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[800px] px-12 py-12 max-md:px-6">
      {/* Breadcrumb */}
      <div className="mb-8 text-[0.82rem] text-ink-muted">
        <Link href="/directory" className="no-underline transition-colors hover:text-ink" style={{ color: "var(--ink-muted)" }}>
          Directory
        </Link>
        {" / "}
        <Link
          href={`/directory?category=${encodeURIComponent(service.category)}`}
          className="no-underline transition-colors hover:text-ink"
          style={{ color: "var(--ink-muted)" }}
        >
          {service.category}
        </Link>
        {" / "}
        <span className="text-ink">{service.name}</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <span
          className="mb-2 inline-block rounded-full px-3 py-1 text-[0.72rem] font-semibold text-ink-muted"
          style={{ background: "var(--paper-dark)" }}
        >
          {service.category}
        </span>
        <h1
          className="mb-2"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(2rem, 4vw, 2.8rem)",
            fontWeight: 400,
            color: "var(--ink)",
          }}
        >
          {service.name}
        </h1>
        {service.recommendations > 0 && (
          <p className="text-[1rem] font-semibold" style={{ color: "var(--accent)" }}>
            {service.recommendations} recommendation{service.recommendations !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Details card */}
      <div className="rounded-[10px] border border-black/6 bg-paper-pure p-8">
        <div className="flex flex-col gap-4">
          {service.address && (
            <div>
              <div className="mb-1 text-[0.72rem] font-bold uppercase tracking-[0.15em] text-ink-muted">
                Address
              </div>
              <div className="text-[0.95rem] text-ink">{service.address}</div>
            </div>
          )}

          {service.phone && (
            <div>
              <div className="mb-1 text-[0.72rem] font-bold uppercase tracking-[0.15em] text-ink-muted">
                Phone
              </div>
              <a
                href={`tel:${service.phone}`}
                className="text-[0.95rem] no-underline"
                style={{ color: "var(--accent)" }}
              >
                {service.phone}
              </a>
            </div>
          )}

          {service.email && (
            <div>
              <div className="mb-1 text-[0.72rem] font-bold uppercase tracking-[0.15em] text-ink-muted">
                Email
              </div>
              <a
                href={`mailto:${service.email}`}
                className="text-[0.95rem] no-underline"
                style={{ color: "var(--accent)" }}
              >
                {service.email}
              </a>
            </div>
          )}

          {service.website && (
            <div>
              <div className="mb-1 text-[0.72rem] font-bold uppercase tracking-[0.15em] text-ink-muted">
                Website
              </div>
              <a
                href={service.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[0.95rem] no-underline"
                style={{ color: "var(--accent)" }}
              >
                {service.website.replace(/^https?:\/\//, "")}
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Recommend + Avatars */}
      <div className="mt-8 flex items-center gap-6">
        <RecommendButton serviceId={id} initialCount={service.recommendations} />
        <RecommenderAvatars
          recentRecommenders={service.recentRecommenders || []}
          totalCount={service.recommendations}
        />
      </div>

      <div className="mt-8">
        <Link
          href="/directory"
          className="text-[0.85rem] font-medium no-underline transition-colors"
          style={{ color: "var(--ink-muted)" }}
        >
          &larr; Back to Directory
        </Link>
      </div>
    </div>
  );
}
