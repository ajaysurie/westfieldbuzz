"use client";

import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

export default function FinishSignInPage() {
  const { completeEmailLink, loggingIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setEmail(window.localStorage.getItem("westfieldbuzz:emailForSignIn") || "");
  }, []);

  const finish = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const destination = await completeEmailLink(email);
      router.replace(destination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The sign-in link could not be completed.");
    }
  };

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-6 py-16">
      <form onSubmit={finish} className="w-full rounded-xl border border-black/8 bg-paper-pure p-7 shadow-sm">
        <p className="mb-2 text-[0.72rem] font-bold uppercase tracking-[0.16em] text-accent">
          One last step
        </p>
        <h1 className="mb-3 font-display text-3xl font-normal text-ink">Finish signing in</h1>
        <p className="mb-6 text-[0.9rem] leading-relaxed text-ink-light">
          Confirm the email address that received this link. We never put it in the URL.
        </p>
        <label htmlFor="finish-email" className="mb-2 block text-[0.78rem] font-semibold text-ink-light">
          Email address
        </label>
        <input
          id="finish-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="min-h-11 w-full rounded-lg border border-black/12 px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <button
          type="submit"
          disabled={loggingIn || !email.trim()}
          className="mt-4 min-h-11 w-full rounded-lg bg-ink px-5 font-semibold text-paper-pure disabled:opacity-50"
        >
          {loggingIn ? "Signing in..." : "Continue"}
        </button>
        {error && <p role="alert" className="mt-4 text-[0.85rem] text-sienna">{error}</p>}
      </form>
    </main>
  );
}
