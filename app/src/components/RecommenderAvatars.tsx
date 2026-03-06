"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Recommender {
  uid: string;
  displayName: string;
  photoURL: string;
}

interface RecommenderAvatarsProps {
  recentRecommenders: { uid: string }[];
  totalCount: number;
}

export default function RecommenderAvatars({
  recentRecommenders,
  totalCount,
}: RecommenderAvatarsProps) {
  const [profiles, setProfiles] = useState<Recommender[]>([]);

  useEffect(() => {
    async function loadProfiles() {
      const loaded: Recommender[] = [];
      for (const rec of recentRecommenders.slice(0, 5)) {
        try {
          const snap = await getDoc(doc(db, "public_profiles", rec.uid));
          if (snap.exists()) {
            loaded.push({ uid: rec.uid, ...snap.data() } as Recommender);
          }
        } catch {
          // skip
        }
      }
      setProfiles(loaded);
    }

    if (recentRecommenders.length > 0) {
      loadProfiles();
    }
  }, [recentRecommenders]);

  if (profiles.length === 0 && totalCount === 0) return null;

  const remaining = totalCount - profiles.length;

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {profiles.map((p) => (
          <div key={p.uid} className="relative" title={p.displayName}>
            {p.photoURL ? (
              <img
                src={p.photoURL}
                alt={p.displayName}
                className="h-7 w-7 rounded-full border-2 border-paper-pure"
              />
            ) : (
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-paper-pure text-[0.6rem] font-semibold text-white"
                style={{ background: "var(--accent)" }}
              >
                {(p.displayName || "?")[0]}
              </div>
            )}
          </div>
        ))}
      </div>
      {remaining > 0 && (
        <span className="text-[0.75rem] text-ink-muted">
          +{remaining} more
        </span>
      )}
    </div>
  );
}
