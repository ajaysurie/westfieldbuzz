"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";

export default function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 flex h-[60px] items-center justify-between border-b border-black/8 px-12 max-md:px-6"
      style={{ background: "var(--paper)", borderTop: "3px solid var(--accent)" }}
    >
      <Link href="/" className="flex items-center no-underline">
        <img
          src="/logo-v3-stacked-hero.svg"
          alt="Westfield Buzz"
          className="h-[48px] w-auto"
        />
      </Link>

      {/* Desktop links */}
      <ul className="flex items-center gap-10 list-none max-md:hidden">
        <li>
          <Link
            href="/directory"
            className="text-[0.85rem] font-medium uppercase tracking-[0.04em] no-underline transition-colors"
            style={{ color: "var(--ink-muted)" }}
          >
            Directory
          </Link>
        </li>
        <li>
          <Link
            href="/events"
            className="text-[0.85rem] font-medium uppercase tracking-[0.04em] no-underline transition-colors"
            style={{ color: "var(--ink-muted)" }}
          >
            Events
          </Link>
        </li>
        <li>
          <Link
            href="/suggest"
            className="text-[0.85rem] font-semibold uppercase tracking-[0.04em] no-underline transition-colors"
            style={{ color: "var(--accent)" }}
          >
            Suggest
          </Link>
        </li>
        <li>
          {user ? (
            <Link
              href="/account"
              className="flex items-center gap-2 no-underline"
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt=""
                  className="h-7 w-7 rounded-full"
                />
              ) : (
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[0.7rem] font-semibold text-white"
                  style={{ background: "var(--accent)" }}
                >
                  {(user.displayName || "U")[0]}
                </div>
              )}
            </Link>
          ) : (
            <Link
              href="/login"
              className="text-[0.85rem] font-semibold uppercase tracking-[0.04em] no-underline transition-colors"
              style={{ color: "var(--accent)" }}
            >
              Join
            </Link>
          )}
        </li>
      </ul>

      {/* Mobile hamburger */}
      <button
        className="hidden max-md:flex flex-col gap-1.5 bg-transparent border-none cursor-pointer p-1"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle menu"
      >
        <span className="block w-5 h-0.5 rounded-full" style={{ background: "var(--ink)" }} />
        <span className="block w-5 h-0.5 rounded-full" style={{ background: "var(--ink)" }} />
        <span className="block w-5 h-0.5 rounded-full" style={{ background: "var(--ink)" }} />
      </button>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          className="fixed top-[60px] left-0 right-0 border-b border-black/8 p-6 flex flex-col gap-4 md:hidden"
          style={{ background: "var(--paper)" }}
        >
          <Link
            href="/directory"
            className="text-[0.9rem] font-medium no-underline"
            style={{ color: "var(--ink)" }}
            onClick={() => setMobileOpen(false)}
          >
            Directory
          </Link>
          <Link
            href="/events"
            className="text-[0.9rem] font-medium no-underline"
            style={{ color: "var(--ink)" }}
            onClick={() => setMobileOpen(false)}
          >
            Events
          </Link>
          <Link
            href="/suggest"
            className="text-[0.9rem] font-semibold no-underline"
            style={{ color: "var(--accent)" }}
            onClick={() => setMobileOpen(false)}
          >
            Suggest a Business
          </Link>
          {user ? (
            <Link
              href="/account"
              className="text-[0.9rem] font-medium no-underline"
              style={{ color: "var(--ink)" }}
              onClick={() => setMobileOpen(false)}
            >
              Account
            </Link>
          ) : (
            <Link
              href="/login"
              className="text-[0.9rem] font-semibold no-underline"
              style={{ color: "var(--accent)" }}
              onClick={() => setMobileOpen(false)}
            >
              Join
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
