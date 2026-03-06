"use client";

import { useAuth } from "@/lib/auth";
import { isUserAdmin } from "@/lib/admin";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function check() {
      if (!loading) {
        if (!user) {
          router.push("/login");
          return;
        }
        const admin = await isUserAdmin(user.email);
        if (!admin) {
          router.push("/");
          return;
        }
        setIsAdmin(true);
        setChecking(false);
      }
    }
    check();
  }, [user, loading, router]);

  if (loading || checking) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-[0.9rem] text-ink-muted">Loading...</div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return <>{children}</>;
}
