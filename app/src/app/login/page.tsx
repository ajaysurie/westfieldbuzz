"use client";

import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const { user, loading, loginWithFacebook } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user) {
      router.push("/");
    }
  }, [user, loading, router]);

  const handleLogin = async () => {
    try {
      setError("");
      await loginWithFacebook();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-[0.9rem] text-ink-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-6">
      <div className="w-full max-w-[400px] text-center">
        <h1
          className="mb-3"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "2.2rem",
            fontWeight: 400,
            color: "var(--ink)",
          }}
        >
          Join Westfield Buzz
        </h1>
        <p className="mb-8 text-[0.95rem] leading-relaxed text-ink-light">
          Sign in with Facebook to recommend local businesses, save your favorites, and
          join the community.
        </p>

        <button
          onClick={handleLogin}
          className="flex w-full items-center justify-center gap-3 rounded-lg px-6 py-3.5 text-[0.95rem] font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-md"
          style={{ background: "#1877F2" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
          Continue with Facebook
        </button>

        {error && (
          <p className="mt-4 text-[0.85rem] text-sienna">{error}</p>
        )}

        <p className="mt-6 text-[0.8rem] text-ink-muted">
          We only access your public profile. Your data stays private.
        </p>
      </div>
    </div>
  );
}
