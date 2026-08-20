"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isUserAdmin } from "@/lib/admin";
import { useAuth } from "@/lib/auth";

export default function Nav() {
  const pathname = usePathname();
  const { user, photoURL, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user?.email) void isUserAdmin(user.email).then(setIsAdmin);
  }, [user]);

  useEffect(() => {
    function closeProfile(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) {
      document.addEventListener("mousedown", closeProfile);
      return () => document.removeEventListener("mousedown", closeProfile);
    }
  }, [profileOpen]);

  const links = [
    { href: "/", label: "This week", active: pathname === "/" },
    { href: "/events", label: "Calendar", active: pathname.startsWith("/events") },
    { href: "/#friday-list", label: "Get the list", active: false },
  ];

  return (
    <nav className="site-nav" aria-label="Primary navigation">
      <Link href="/" className="site-nav__brand">
        <img src="/logo-v3-stacked-hero.svg" alt="Westfield Buzz" />
      </Link>

      <ul className="site-nav__links">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} aria-current={link.active ? "page" : undefined}>{link.label}</Link>
          </li>
        ))}
        {user && (
          <li>
            <div ref={profileRef} className="profile-menu">
              <button
                type="button"
                className="profile-menu__trigger"
                onClick={() => setProfileOpen((open) => !open)}
                aria-expanded={profileOpen}
                aria-label="Open account menu"
              >
                {photoURL ? (
                  <img src={photoURL} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span>{(user.displayName || "U")[0]}</span>
                )}
              </button>
              {profileOpen && (
                <div className="profile-menu__panel">
                  <p>{user.displayName || "Your account"}</p>
                  <Link href="/account" onClick={() => setProfileOpen(false)}>Account</Link>
                  {user && isAdmin && <Link href="/admin" onClick={() => setProfileOpen(false)}>Admin</Link>}
                  <button type="button" onClick={() => { setProfileOpen(false); void logout(); }}>Sign out</button>
                </div>
              )}
            </div>
          </li>
        )}
      </ul>

      <button
        type="button"
        className="site-nav__menu"
        onClick={() => setMobileOpen((open) => !open)}
        aria-expanded={mobileOpen}
        aria-controls="mobile-navigation"
        aria-label="Toggle navigation menu"
      >
        <span /><span /><span />
      </button>

      {mobileOpen && (
        <div id="mobile-navigation" className="site-nav__mobile">
          {links.map((link) => (
            <Link key={link.href} href={link.href} aria-current={link.active ? "page" : undefined} onClick={() => setMobileOpen(false)}>
              {link.label}
            </Link>
          ))}
          {user && (
            <>
              <Link href="/account" onClick={() => setMobileOpen(false)}>Account</Link>
              {user && isAdmin && <Link href="/admin" onClick={() => setMobileOpen(false)}>Admin</Link>}
              <button type="button" onClick={() => { setMobileOpen(false); void logout(); }}>Sign out</button>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
