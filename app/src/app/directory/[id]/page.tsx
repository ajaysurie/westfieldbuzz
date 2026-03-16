"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getServiceById, type Service } from "@/lib/firestore";
import RecommendButton from "@/components/RecommendButton";
import { formatReviewerName } from "@/lib/format";

function ServiceDetailContent() {
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
              <div className="mb-1 text-[0.75rem] font-bold uppercase tracking-[0.15em] text-ink-muted">
                Address
              </div>
              <a
                href={service.googleMapsUrl || `https://maps.google.com/?q=${encodeURIComponent(service.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[0.95rem] no-underline transition-colors hover:underline"
                style={{ color: "var(--accent)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {service.address}
              </a>
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
                {service.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            </div>
          )}

          {/* Links row — Maps, Instagram, Facebook, Yelp with brand colors */}
          {(service.googleMapsUrl || service.instagram || service.facebook || service.yelp) && (
            <div className="mt-4 border-t border-black/6 pt-4">
              <div className="flex flex-wrap items-center gap-3">
                {service.googleMapsUrl && (
                  <a href={service.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full border border-black/6 px-3 py-1.5 text-[0.8rem] no-underline transition-colors hover:bg-black/3" title="View on Google Maps">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#EA4335" stroke="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                    <span className="text-ink-muted">Maps</span>
                  </a>
                )}
                {service.instagram && (
                  <a href={service.instagram.startsWith("http") ? service.instagram : `https://instagram.com/${service.instagram}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full border border-black/6 px-3 py-1.5 text-[0.8rem] no-underline transition-colors hover:bg-black/3" title="Instagram">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ig-detail" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#FFDC80"/><stop offset="25%" stopColor="#F77737"/><stop offset="50%" stopColor="#E1306C"/><stop offset="75%" stopColor="#C13584"/><stop offset="100%" stopColor="#833AB4"/></linearGradient></defs><path fill="url(#ig-detail)" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                    <span className="text-ink-muted">Instagram</span>
                  </a>
                )}
                {service.facebook && (
                  <a href={service.facebook} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full border border-black/6 px-3 py-1.5 text-[0.8rem] no-underline transition-colors hover:bg-black/3" title="Facebook">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    <span className="text-ink-muted">Facebook</span>
                  </a>
                )}
                {service.yelp && (
                  <a href={service.yelp} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full border border-black/6 px-3 py-1.5 text-[0.8rem] no-underline transition-colors hover:bg-black/3" title="Yelp">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#D32323"><path d="M20.16 12.594l-4.995 1.433c-.96.276-1.74-.8-1.176-1.63l2.905-4.308a1.072 1.072 0 011.596-.206 7.26 7.26 0 011.96 3.105c.262.753-.29 1.606-1.09 1.606h-.2zm-5.753 3.381l4.55 2.545a1.073 1.073 0 01.266 1.608 7.244 7.244 0 01-2.905 2.169c-.736.303-1.542-.197-1.612-.998l-.366-5.324c-.067-.979 1.107-1.528 1.867-.8l.2.2zm-2.878-1.677l-4.55 2.545a1.073 1.073 0 01-1.608-.266A7.244 7.244 0 013.2 13.672c-.303-.736.197-1.542.998-1.612l5.324-.366c.979-.067 1.528 1.107.8 1.867l-.2.2-.593.537zm-.702-3.381L5.832 8.372a1.073 1.073 0 01.206-1.596 7.26 7.26 0 013.105-1.96c.753-.262 1.556.29 1.556 1.09v.2l.433 4.995c.076.96-1 1.54-1.63.976l-.58-.56zM12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0z"/></svg>
                    <span className="text-ink-muted">Yelp</span>
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recommended by */}
      {service.recentRecommenders?.length > 0 && (
        <div className="mt-8 rounded-[10px] border border-black/6 bg-paper-pure p-8">
          <div className="mb-4 text-[0.72rem] font-bold uppercase tracking-[0.15em] text-ink-muted">
            Recommended by
          </div>
          <div className="flex flex-wrap gap-3">
            {service.recentRecommenders.map((rec, i) => {
              const name = formatReviewerName(typeof rec === "string" ? rec : rec.displayName);
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-full border border-black/6 px-3 py-1.5"
                >
                  <div
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[0.55rem] font-semibold text-white"
                    style={{ background: "var(--accent)" }}
                  >
                    {name[0]}
                  </div>
                  <span className="text-[0.82rem] text-ink">{name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommend action */}
      <div className="mt-6 flex items-center gap-6">
        <RecommendButton serviceId={id} initialCount={service.recommendations} />
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

export default function ServiceDetailPage() {
  return <ServiceDetailContent />;
}
