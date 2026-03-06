"use client";

import { useAuth } from "@/lib/auth";
import AuthGate from "@/components/AuthGate";
import { useRouter } from "next/navigation";

export default function AccountPage() {
  return (
    <AuthGate>
      <AccountContent />
    </AuthGate>
  );
}

function AccountContent() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  return (
    <div className="mx-auto max-w-[600px] px-12 py-16 max-md:px-6">
      <h1
        className="mb-8"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "2rem",
          fontWeight: 400,
          color: "var(--ink)",
        }}
      >
        Your Account
      </h1>

      <div className="mb-8 flex items-center gap-4 rounded-[10px] border border-black/6 bg-paper-pure p-6">
        {user?.photoURL && (
          <img
            src={user.photoURL}
            alt=""
            className="h-14 w-14 rounded-full"
          />
        )}
        <div>
          <div className="text-[1rem] font-semibold text-ink">
            {user?.displayName || "User"}
          </div>
          <div className="text-[0.85rem] text-ink-muted">
            {user?.email || ""}
          </div>
        </div>
      </div>

      {/* Recommendations and interested events will be added in Blocks 4 and 6 */}

      <button
        onClick={handleLogout}
        className="rounded-lg border border-black/12 bg-paper-pure px-6 py-2.5 text-[0.85rem] font-medium text-ink-light transition-colors hover:border-black/20 hover:text-ink"
      >
        Log Out
      </button>
    </div>
  );
}
