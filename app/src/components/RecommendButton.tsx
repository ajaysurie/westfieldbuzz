"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { hasUserRecommended, recommendService, unrecommendService } from "@/lib/firestore";
import { useRouter } from "next/navigation";

interface RecommendButtonProps {
  serviceId: string;
  initialCount: number;
}

export default function RecommendButton({ serviceId, initialCount }: RecommendButtonProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [recommended, setRecommended] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      hasUserRecommended(serviceId, user.uid).then(setRecommended);
    }
  }, [user, serviceId]);

  const handleToggle = async () => {
    if (!user) {
      router.push("/login");
      return;
    }

    setLoading(true);
    try {
      if (recommended) {
        await unrecommendService(serviceId, user.uid);
        setRecommended(false);
        setCount((c) => Math.max(0, c - 1));
      } else {
        await recommendService(serviceId, user.uid);
        setRecommended(true);
        setCount((c) => c + 1);
      }
    } catch (err) {
      console.error("Recommend toggle failed:", err);
    }
    setLoading(false);
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 max-md:py-3 text-[0.85rem] font-semibold transition-all ${
        recommended
          ? "border border-accent bg-accent/10 text-accent"
          : "border border-black/12 bg-paper-pure text-ink-light hover:border-accent hover:text-accent"
      } ${loading ? "opacity-50" : ""}`}
    >
      <span>{recommended ? "\u2764\uFE0F" : "\u2661"}</span>
      <span>{count} Recommend{count !== 1 ? "s" : ""}</span>
    </button>
  );
}
