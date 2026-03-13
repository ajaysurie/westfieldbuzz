"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatReviewerName } from "@/lib/format";

interface RecommenderAvatarsProps {
  recentRecommenders: (string | { uid: string })[];
  totalCount: number;
}

interface ResolvedProfile {
  key: string;
  displayName: string;
  photoURL?: string;
}

export default function RecommenderAvatars({
  recentRecommenders,
  totalCount,
}: RecommenderAvatarsProps) {
  const [profiles, setProfiles] = useState<ResolvedProfile[]>([]);

  useEffect(() => {
    async function loadProfiles() {
      const loaded: ResolvedProfile[] = [];

      for (const rec of recentRecommenders.slice(0, 5)) {
        if (typeof rec === "string") {
          // Seeded data: plain name string
          loaded.push({ key: rec, displayName: rec });
        } else {
          // Real user recommendation: look up profile
          try {
            const snap = await getDoc(doc(db, "public_profiles", rec.uid));
            if (snap.exists()) {
              const data = snap.data();
              loaded.push({
                key: rec.uid,
                displayName: data.displayName || "User",
                photoURL: data.photoURL,
              });
            }
          } catch {
            // skip
          }
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
    <div className="flex items-center gap-3">
      <div className="flex -space-x-2">
        {profiles.map((p) => (
          <div key={p.key} className="relative" title={formatReviewerName(p.displayName)}>
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
      <span className="text-[0.82rem] text-ink-light">
        {profiles.length > 0 && (
          <>
            {profiles.map((p) => formatReviewerName(p.displayName)).join(", ")}
            {remaining > 0 && ` + ${remaining} more`}
          </>
        )}
      </span>
    </div>
  );
}
