// src/app/components/Header.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import type { Session } from "next-auth";
import { useEffect, useState, type MouseEventHandler } from "react";
import SearchBox from "@/app/components/SearchBox";
import HeaderInlineSearch from "@/app/components/HeaderInlineSearch";
import AuthButtons from "@/app/components/AuthButtons";
import { signOut } from "next-auth/react";

/** Simple helper for active link classes */
function NavLink({
  href,
  children,
  className = "",
  exact = false,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  exact?: boolean;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      prefetch={false}
      {...(onClick ? { onClick } : {})}
      className={[
        "px-2 py-1 rounded-md transition",
        isActive
          ? "text-[#161748] dark:text-white bg-black/5 dark:bg-white/10"
          : "text-gray-700 hover:bg-black/5 dark:text-slate-200 dark:hover:bg-white/10",
        className,
      ].join(" ")}
      aria-current={isActive ? "page" : undefined}
    >
      {children}
    </Link>
  );
}

export default function Header() {
  const { data: session, status, update } = useSession();
  const pathname = usePathname();

  type ExtendedUser = Session["user"] & { username?: string | null; image?: string | null };
  const user: ExtendedUser | null = (session?.user as ExtendedUser) ?? null;
  const username = user?.username ?? undefined;

  // Mobile menu
  const [open, setOpen] = useState(false);

  // Close overlays when route/hash changes or Esc
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onHash = () => setOpen(false);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Keep session fresh when profile photo changes (so AuthButtons avatar updates)
  useEffect(() => {
    const onUpdated = () => {
      try {
        // ts-expect-error: update is available in next-auth/react
        update?.();
      } catch {}
    };
    window.addEventListener("qs:profile:photo:updated", onUpdated as EventListener);
    window.addEventListener("qs:profile:photo:removed", onUpdated as EventListener);
    return () => {
      window.removeEventListener("qs:profile:photo:updated", onUpdated as EventListener);
      window.removeEventListener("qs:profile:photo:removed", onUpdated as EventListener);
    };
  }, [update]);

  return (
    <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur dark:bg-slate-900/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        {/* Brand */}
        <Link
          href="/"
          prefetch={false}
          className="tracking-tight font-extrabold text-[#161748] dark:text-white"
          aria-label="QwikSale home"
        >
          QwikSale
        </Link>

        {/* Desktop search row (hide on Home to avoid duplicate filters) */}
        {pathname !== "/" && (
          <div className="hidden md:flex flex-1">
            <SearchBox
              className="w-full"
              placeholder="Search phones, cars, services…"
              destination="search"
            />
          </div>
        )}

        {/* Primary nav (desktop) */}
        <nav className="ml-4 hidden items-center gap-2 text-sm sm:flex" aria-label="Primary">
          <NavLink href="/" exact>
            Home
          </NavLink>
          <NavLink href="/sell">Sell</NavLink>

          {/* Optional categories trigger (bridges to AppShell drawer) */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("qs:categories:open"))}
            className="px-2 py-1 rounded-md text-gray-700 hover:bg-black/5 dark:text-slate-200 dark:hover:bg-white/10 transition"
            title="Browse categories"
          >
            Categories
          </button>

          {/* Minimal Search link so search is ALWAYS present on desktop */}
          <NavLink href="/search">Search</NavLink>

          {/* Saved (keep as a link in the row) */}
          <NavLink href="/saved">Saved</NavLink>
        </nav>

        {/* Inline header search (between Saved and auth) */}
        <div className="hidden sm:block">
          <HeaderInlineSearch />
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          className="ml-auto rounded-md p-2 sm:hidden hover:bg-black/5 dark:hover:bg-white/10"
          aria-label="Toggle menu"
          aria-expanded={open ? "true" : "false"}
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            {open ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
          </svg>
        </button>

        {/* Right side actions (desktop) */}
        <div className="ml-auto hidden sm:flex items-center gap-3">
          {status === "loading" ? (
            <div className="h-7 w-24 animate-pulse rounded-md bg-black/5 dark:bg-white/10" />
          ) : status === "authenticated" ? (
            <>
              <NavLink href="/dashboard" className="hidden sm:inline-block">
                Dashboard
              </NavLink>
              <Link
                href="/sell"
                prefetch={false}
                className="rounded-lg bg-[#161748] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                Post
              </Link>
              {/* ✅ Restored signed-in user dropdown with Sign out */}
              <AuthButtons />
            </>
          ) : (
            <>
              <NavLink href="/signin" className="hidden sm:inline-block">
                Sign in
              </NavLink>
              <Link
                href="/signup"
                prefetch={false}
                className="rounded-lg bg-[#161748] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                Join
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile search row (always visible on mobile) */}
      <div className="border-t bg-white/90 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/90 md:hidden">
        <SearchBox placeholder="Search phones, cars, services…" destination="search" />
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="bg-white/95 dark:bg-slate-900/95 sm:hidden border-t">
          <nav className="mx-auto grid max-w-6xl gap-1 px-4 py-3 text-sm" aria-label="Mobile">
            <NavLink href="/" exact className="py-2" onClick={() => setOpen(false)}>
              Home
            </NavLink>
            <NavLink href="/sell" className="py-2" onClick={() => setOpen(false)}>
              Sell
            </NavLink>
            <button
              type="button"
              className="px-2 py-2 text-left rounded-md hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("qs:categories:open"));
                setOpen(false);
              }}
            >
              Categories
            </button>
            <NavLink href="/search" className="py-2" onClick={() => setOpen(false)}>
              Search
            </NavLink>
            <NavLink href="/saved" className="py-2" onClick={() => setOpen(false)}>
              Saved
            </NavLink>

            {status === "authenticated" ? (
              <>
                <NavLink href="/dashboard" className="py-2" onClick={() => setOpen(false)}>
                  Dashboard
                </NavLink>
                <Link
                  href={username ? `/store/${encodeURIComponent(username)}` : "/dashboard"}
                  prefetch={false}
                  className="rounded-md px-2 py-2 hover:bg-black/5 dark:hover:bg-white/10"
                  onClick={() => setOpen(false)}
                >
                  Your store/profile
                </Link>

                {/* ✅ Mobile Sign out */}
                <button
                  type="button"
                  className="mt-2 w-full text-left rounded-md px-2 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 border-t border-gray-200 dark:border-gray-700"
                  onClick={async () => {
                    setOpen(false);
                    await signOut({ callbackUrl: "/" });
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <NavLink href="/signin" className="py-2" onClick={() => setOpen(false)}>
                Sign in
                </NavLink>
                <Link
                  href="/signup"
                  prefetch={false}
                  className="rounded-md bg-[#161748] px-2 py-2 text-center font-medium text-white"
                  onClick={() => setOpen(false)}
                >
                  Create account
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
