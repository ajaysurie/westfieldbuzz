"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import AdminGate from "@/components/AdminGate";
import { getAllServices, deleteService, type Service } from "@/lib/firestore";

function ServicesManager() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    getAllServices().then((s) => {
      setServices(s.sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
    });
  }, []);

  async function handleDelete(service: Service) {
    if (!confirm(`Delete "${service.name}"? This cannot be undone.`)) return;
    setDeleting(service.id);
    await deleteService(service.id);
    setServices((prev) => prev.filter((s) => s.id !== service.id));
    setDeleting(null);
  }

  if (loading) return <p className="text-[0.85rem] text-ink-muted">Loading services...</p>;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[0.8rem] text-ink-muted mb-2">{services.length} services total</p>
      {services.map((s) => (
        <div
          key={s.id}
          className="flex items-center justify-between rounded-lg border border-black/6 bg-paper-pure px-4 py-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[0.9rem] font-medium truncate" style={{ color: "var(--ink)" }}>
                  {s.name}
                </span>
                {s.seeded && (
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider"
                    style={{ background: "var(--accent)", color: "white", opacity: 0.8 }}
                  >
                    Seed
                  </span>
                )}
              </div>
              <span className="text-[0.75rem] text-ink-muted">{s.category}</span>
            </div>
          </div>
          <button
            onClick={() => handleDelete(s)}
            disabled={deleting === s.id}
            className="shrink-0 cursor-pointer rounded-md border border-red-200 bg-transparent px-3 py-1 text-[0.75rem] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            {deleting === s.id ? "Deleting..." : "Delete"}
          </button>
        </div>
      ))}
    </div>
  );
}

export default function AdminPage() {
  return (
    <AdminGate>
      <div className="mx-auto max-w-[600px] px-12 py-12 max-md:px-6">
        <div
          className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.15em]"
          style={{ color: "var(--accent)" }}
        >
          Admin
        </div>
        <h1
          className="mb-8"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "2rem",
            fontWeight: 400,
            color: "var(--ink)",
          }}
        >
          Dashboard
        </h1>

        <div className="flex flex-col gap-4">
          <Link
            href="/admin/suggestions"
            className="rounded-[10px] border border-black/6 bg-paper-pure p-6 no-underline transition-all hover:shadow-md"
          >
            <h3
              className="mb-1 text-[1.1rem]"
              style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--ink)" }}
            >
              Review Suggestions
            </h3>
            <p className="text-[0.85rem] text-ink-muted">
              Approve or reject community-submitted businesses
            </p>
          </Link>

          <Link
            href="/admin/events"
            className="rounded-[10px] border border-black/6 bg-paper-pure p-6 no-underline transition-all hover:shadow-md"
          >
            <h3
              className="mb-1 text-[1.1rem]"
              style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--ink)" }}
            >
              Manage Events
            </h3>
            <p className="text-[0.85rem] text-ink-muted">
              Add, edit, and remove community events
            </p>
          </Link>
        </div>

        {/* Services Management */}
        <div className="mt-12">
          <h2
            className="mb-4"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.4rem",
              fontWeight: 400,
              color: "var(--ink)",
            }}
          >
            Services
          </h2>
          <ServicesManager />
        </div>
      </div>
    </AdminGate>
  );
}
