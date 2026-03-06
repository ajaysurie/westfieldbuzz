"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { hasUserInterested, markInterested, unmarkInterested } from "@/lib/firestore";
import { useRouter } from "next/navigation";

interface InterestedButtonProps {
  eventId: string;
  initialCount: number;
}

export default function InterestedButton({ eventId, initialCount }: InterestedButtonProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [interested, setInterested] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      hasUserInterested(eventId, user.uid).then(setInterested);
    }
  }, [user, eventId]);

  const handleToggle = async () => {
    if (!user) {
      router.push("/login");
      return;
    }

    setLoading(true);
    try {
      if (interested) {
        await unmarkInterested(eventId, user.uid);
        setInterested(false);
        setCount((c) => Math.max(0, c - 1));
      } else {
        await markInterested(eventId, user.uid);
        setInterested(true);
        setCount((c) => c + 1);
      }
    } catch (err) {
      console.error("Interested toggle failed:", err);
    }
    setLoading(false);
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[0.82rem] font-semibold transition-all ${
        interested
          ? "border border-accent bg-accent/10 text-accent"
          : "border border-black/12 bg-paper-pure text-ink-light hover:border-accent hover:text-accent"
      } ${loading ? "opacity-50" : ""}`}
    >
      <span>{interested ? "\u2605" : "\u2606"}</span>
      <span>{count} Interested</span>
    </button>
  );
}
