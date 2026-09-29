"use client";

import { useCallback, useEffect, useState } from "react";
import AdminGate from "@/components/AdminGate";
import SubscribersView, { type SubscribersData } from "@/components/SubscribersView";
import { useAuth } from "@/lib/auth";

function SubscriberList() {
  const { user } = useAuth();
  const [data, setData] = useState<SubscribersData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setError("");
    try {
      const response = await fetch("/api/admin/subscribers", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Could not load subscribers.");
      setData(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load subscribers.");
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  if (error) return <p className="text-[0.85rem]" style={{ color: "#a33" }}>{error}</p>;
  if (!data) return <p className="text-[0.85rem] text-ink-muted">Loading subscribers…</p>;
  return <SubscribersView data={data} />;
}

export default function AdminSubscribersPage() {
  return (
    <AdminGate>
      <div className="mx-auto max-w-[720px] px-12 py-12 max-md:px-6">
        <div className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.15em]" style={{ color: "var(--accent)" }}>
          Admin
        </div>
        <h1 className="mb-6" style={{ fontFamily: "var(--font-display)", fontSize: "2rem", fontWeight: 400, color: "var(--ink)" }}>
          Friday list
        </h1>
        <SubscriberList />
      </div>
    </AdminGate>
  );
}
