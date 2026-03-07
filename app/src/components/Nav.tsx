"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth";

export default function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { user, photoURL, logout } = useAuth();
  const pathname = usePathname();
  const profileRef = useRef<HTMLDivElement>(null);

  // Close profile dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [profileOpen]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const navLinkClass = (href: string) =>
    `text-[0.85rem] font-medium uppercase tracking-[0.04em] no-underline transition-colors ${
      isActive(href) ? "text-accent" : "text-ink-muted hover:text-ink"
    }`;

  const mobileNavClass = (href: string) =>
    `text-[0.9rem] font-medium no-underline py-1 ${
      isActive(href) ? "text-accent" : "text-ink"
    }`;

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
          <Link href="/directory" className={navLinkClass("/directory")}>
            Directory
          </Link>
        </li>
        <li>
          <Link href="/events" className={navLinkClass("/events")}>
            Events
          </Link>
        </li>
        <li>
          <Link
            href="/suggest"
            className={`text-[0.85rem] font-semibold uppercase tracking-[0.04em] no-underline transition-colors ${
              isActive("/suggest") ? "text-accent" : "text-accent hover:text-accent-light"
            }`}
          >
            Suggest
          </Link>
        </li>
        <li>
          {user ? (
            <div ref={profileRef} className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 cursor-pointer border-none bg-transparent p-0"
              >
                {photoURL ? (
                  <img
                    src={photoURL}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[0.75rem] font-semibold text-white"
                    style={{ background: "var(--accent)" }}
                  >
                    {(user.displayName || "U")[0]}
                  </div>
                )}
              </button>
              {profileOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-black/8 bg-paper-pure p-3 shadow-md"
                  style={{ zIndex: 100 }}
                >
                  <div className="mb-3 flex items-center gap-3 border-b border-black/6 pb-3">
                    {photoURL ? (
                      <img
                        src={photoURL}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full text-[0.85rem] font-semibold text-white"
                        style={{ background: "var(--accent)" }}
                      >
                        {(user.displayName || "U")[0]}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-[0.88rem] font-medium text-ink">
                        {user.displayName || "User"}
                      </div>
                    </div>
                  </div>
                  <Link
                    href="/account"
                    className="block rounded-md px-3 py-2 text-[0.85rem] text-ink no-underline transition-colors hover:bg-paper-dark"
                    onClick={() => setProfileOpen(false)}
                  >
                    My Profile
                  </Link>
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      logout();
                    }}
                    className="w-full cursor-pointer rounded-md border-none bg-transparent px-3 py-2 text-left text-[0.85rem] text-ink transition-colors hover:bg-paper-dark"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
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
          className="fixed top-[60px] left-0 right-0 border-b border-black/8 p-6 flex flex-col gap-3 md:hidden"
          style={{ background: "var(--paper)" }}
        >
          <Link
            href="/directory"
            className={mobileNavClass("/directory")}
            onClick={() => setMobileOpen(false)}
          >
            Directory
          </Link>
          <Link
            href="/events"
            className={mobileNavClass("/events")}
            onClick={() => setMobileOpen(false)}
          >
            Events
          </Link>
          <Link
            href="/suggest"
            className={`text-[0.9rem] font-semibold no-underline py-1 ${
              isActive("/suggest") ? "text-accent" : "text-accent"
            }`}
            onClick={() => setMobileOpen(false)}
          >
            Suggest a Business
          </Link>
          {user ? (
            <>
              <div className="mt-2 border-t border-black/6 pt-3 flex items-center gap-3">
                {photoURL ? (
                  <img
                    src={photoURL}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[0.75rem] font-semibold text-white"
                    style={{ background: "var(--accent)" }}
                  >
                    {(user.displayName || "U")[0]}
                  </div>
                )}
                <span className="text-[0.88rem] font-medium text-ink">
                  {user.displayName || "User"}
                </span>
              </div>
              <Link
                href="/account"
                className="text-[0.9rem] font-medium text-ink no-underline py-1"
                onClick={() => setMobileOpen(false)}
              >
                My Profile
              </Link>
              <button
                onClick={() => {
                  setMobileOpen(false);
                  logout();
                }}
                className="w-full cursor-pointer border-none bg-transparent p-0 py-1 text-left text-[0.9rem] font-medium text-ink"
              >
                Sign Out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="text-[0.9rem] font-semibold text-accent no-underline py-1"
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
