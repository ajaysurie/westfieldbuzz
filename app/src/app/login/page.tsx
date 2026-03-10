"use client";

import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";

export default function LoginPage() {
  const { user, loading, loggingIn, authError, loginWithFacebook, loginWithGoogle } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push("/directory");
    }
  }, [user, loading, router]);

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
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-1.5 text-[0.85rem] text-ink-muted no-underline transition-colors hover:text-accent"
        >
          <span>&larr;</span> Back to home
        </Link>
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
          Sign in to recommend local businesses, save your favorites, and
          join the community.
        </p>

        <button
          onClick={loginWithGoogle}
          disabled={loggingIn}
          className={`flex w-full items-center justify-center gap-3 rounded-lg px-6 py-3.5 text-[0.95rem] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-md ${loggingIn ? "opacity-60 cursor-not-allowed" : ""}`}
          style={{ background: "#fff", color: "#3c4043", border: "1px solid #dadce0" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l3.56-2.77.01-.54z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          {loggingIn ? "Signing in..." : "Continue with Google"}
        </button>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1" style={{ background: "var(--border)" }} />
          <span className="text-[0.8rem] text-ink-muted">or</span>
          <div className="h-px flex-1" style={{ background: "var(--border)" }} />
        </div>

        <button
          onClick={loginWithFacebook}
          disabled={loggingIn}
          className={`flex w-full items-center justify-center gap-3 rounded-lg px-6 py-3.5 text-[0.95rem] font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-md ${loggingIn ? "opacity-60 cursor-not-allowed" : ""}`}
          style={{ background: "#1877F2" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
          {loggingIn ? "Signing in..." : "Continue with Facebook"}
        </button>

        {authError && (
          <p className="mt-4 text-[0.85rem] text-sienna">{authError}</p>
        )}

        <p className="mt-6 text-[0.8rem] text-ink-muted">
          We only access your public profile. Your data stays private.
        </p>
      </div>
    </div>
  );
}
