"use client";

import { safeReturnTo, useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

export default function LoginPage() {
  const {
    user,
    loading,
    loggingIn,
    authError,
    emailLinkSent,
    loginWithGoogle,
    sendEmailLink,
  } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [returnTo, setReturnTo] = useState("/");

  useEffect(() => {
    setReturnTo(
      safeReturnTo(new URLSearchParams(window.location.search).get("returnTo"))
    );
  }, []);

  useEffect(() => {
    if (!loading && user) {
      router.push(returnTo);
    }
  }, [user, loading, router, returnTo]);

  const handleEmailLink = async (event: FormEvent) => {
    event.preventDefault();
    await sendEmailLink(email, returnTo);
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
          Save your Westfield Buzz
        </h1>
        <p className="mb-8 text-[0.95rem] leading-relaxed text-ink-light">
          Sign in only if you want to save events, searches, or household
          preferences. Browsing and the full calendar stay open to everyone.
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

        <form onSubmit={handleEmailLink} className="space-y-3 text-left">
          <label htmlFor="email" className="block text-[0.78rem] font-semibold text-ink-light">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-black/12 bg-paper-pure px-4 text-base text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            placeholder="you@example.com"
          />
          <button
            type="submit"
            disabled={loggingIn || !email.trim()}
            className={`min-h-11 w-full rounded-lg border border-ink bg-ink px-6 text-[0.92rem] font-semibold text-paper-pure transition hover:-translate-y-0.5 hover:shadow-md ${loggingIn || !email.trim() ? "cursor-not-allowed opacity-60" : ""}`}
          >
            {loggingIn ? "Sending link..." : "Email me a sign-in link"}
          </button>
        </form>

        {emailLinkSent && (
          <p role="status" className="mt-4 rounded-lg bg-mist px-4 py-3 text-[0.85rem] text-ink">
            Check your inbox. The link will return you to what you were doing.
          </p>
        )}

        {authError && (
          <p className="mt-4 text-[0.85rem] text-sienna">{authError}</p>
        )}

        <p className="mt-6 text-[0.8rem] text-ink-muted">
          No password and no Facebook required. We only use saved preferences
          when you ask us to personalize your Friday email.
        </p>
      </div>
    </div>
  );
}
