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
  const { user, photoURL, authError, linkFacebook, logout } = useAuth();
  const router = useRouter();
  const hasFacebook = user?.providerData?.some(p => p.providerId === "facebook.com");

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
        {photoURL && (
          <img
            src={photoURL}
            alt=""
            className="h-14 w-14 rounded-full"
            referrerPolicy="no-referrer"
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

      {/* Linked accounts */}
      <div className="mb-8">
        <div className="mb-3 text-[0.72rem] font-bold uppercase tracking-[0.15em] text-ink-muted">
          Linked Accounts
        </div>
        <div className="flex flex-col gap-2">
          {user?.providerData?.map((p) => (
            <div key={p.providerId} className="flex items-center gap-2 text-[0.85rem] text-ink-light">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
              {p.providerId === "google.com" ? "Google" : p.providerId === "facebook.com" ? "Facebook" : p.providerId}
            </div>
          ))}
          {!hasFacebook && (
            <button
              onClick={linkFacebook}
              className="mt-1 flex w-fit items-center gap-2 rounded-lg px-4 py-2 text-[0.82rem] font-medium text-white transition-all hover:-translate-y-0.5 hover:shadow-md"
              style={{ background: "#1877F2" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              Link Facebook Account
            </button>
          )}
        </div>
        {authError && (
          <p className="mt-2 text-[0.82rem] text-sienna">{authError}</p>
        )}
      </div>

      <button
        onClick={handleLogout}
        className="rounded-lg border border-black/12 bg-paper-pure px-6 py-2.5 text-[0.85rem] font-medium text-ink-light transition-colors hover:border-black/20 hover:text-ink"
      >
        Log Out
      </button>
    </div>
  );
}
