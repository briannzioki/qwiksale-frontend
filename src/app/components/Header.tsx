// src/app/components/Header.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import type { Session } from "next-auth";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import UserAvatar from "@/app/components/UserAvatar";
import SearchBox from "@/app/components/SearchBox";
import useOutsideClick from "@/app/hooks/useOutsideClick";

/** Simple helper for active link classes */
function NavLink({
  href,
  children,
  className = "",
  exact = false,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
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

  type ExtendedUser = Session["user"] & { username?: string | null };
  const user: ExtendedUser | null = (session?.user as ExtendedUser) ?? null;
  const username = user?.username ?? undefined;

  // Optimistic avatar (updates instantly after upload)
  const [avatarOverride, setAvatarOverride] = useState<string | null>(null);

  // Mobile menu
  const [open, setOpen] = useState(false);

  // Pinned inline search
  const [inlineOpen, setInlineOpen] = useState(false);
  const inlineWrapRef = useRef<HTMLDivElement | null>(null);
  const inlineBtnId = useId();
  useOutsideClick(inlineWrapRef, () => setInlineOpen(false));

  const toggleInline = useCallback(() => setInlineOpen((v) => !v), []);
  const closeInline = useCallback(() => setInlineOpen(false), []);

  // Close overlays when route changes
  const pathname = usePathname();
  useEffect(() => {
    setOpen(false);
    setInlineOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onHash = () => {
      setOpen(false);
      setInlineOpen(false);
    };
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

  // Listen for profile photo changes from the uploader
  useEffect(() => {
    const onUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail as { avatar?: string; url?: string } | undefined;
      const next = detail?.avatar || detail?.url || null;
      setAvatarOverride(next ?? null);
      try {
        // ts-expect-error: update is available in next-auth/react
        update?.();
      } catch {}
    };
    const onRemoved = () => {
      setAvatarOverride(null);
      try {
        // ts-expect-error: update is available in next-auth/react
        update?.();
      } catch {}
    };

    window.addEventListener("qs:profile:photo:updated", onUpdated as EventListener);
    window.addEventListener("qs:profile:photo:removed", onRemoved as EventListener);
    return () => {
      window.removeEventListener("qs:profile:photo:updated", onUpdated as EventListener);
      window.removeEventListener("qs:profile:photo:removed", onRemoved as EventListener);
    };
  }, [update]);

  const avatarSrc = avatarOverride ?? (user?.image ?? null);

  return (
    <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur dark:bg-slate-900/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        {/* Brand */}
        <Link
          href="/"
          className="tracking-tight font-extrabold text-[#161748] dark:text-white"
          aria-label="QwikSale home"
        >
          QwikSale
        </Link>

        {/* Desktop search row (actual search input on md+) */}
        <div className="hidden md:flex flex-1">
          <SearchBox className="w-full" placeholder="Search phones, cars, services…" />
        </div>

        {/* Primary nav (desktop) */}
        <nav className="ml-4 hidden items-center gap-1 text-sm sm:flex" aria-label="Primary">
          <NavLink href="/" exact>
            Home
          </NavLink>
          <NavLink href="/sell">Sell</NavLink>

          {/* Minimal Search link so search is ALWAYS present on desktop */}
          <NavLink href="/search">Search</NavLink>

          {/* Pinned search icon + inline box */}
          <div
            ref={inlineWrapRef}
            className="relative ml-1 hidden sm:flex items-center"
            aria-label="Pinned search"
          >
            <button
              id={`inline-btn-${inlineBtnId}`}
              type="button"
              aria-label="Open quick search"
              aria-haspopup="true"
              aria-expanded={inlineOpen ? "true" : "false"}
              onClick={toggleInline}
              className={[
                "rounded-md p-2 transition",
                inlineOpen
                  ? "bg-black/5 text-[#161748] dark:bg-white/10 dark:text-white"
                  : "text-gray-700 hover:bg-black/5 dark:text-slate-200 dark:hover:bg-white/10",
              ].join(" ")}
              title="Quick search"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M21 20l-5.2-5.2a7 7 0 10-1.4 1.4L20 21l1-1zM5 11a6 6 0 1112 0A6 6 0 015 11z" />
              </svg>
            </button>

            <SearchBox
              variant="inline"
              open={inlineOpen}
              onCloseAction={closeInline}
              autoFocus
              placeholder="Search quickly…"
              className="ml-2"
            />
          </div>

          <NavLink href="/saved">Saved</NavLink>
        </nav>

        {/* Mobile menu button */}
        <button
          type="button"
          className="ml-2 rounded-md p-2 sm:hidden hover:bg-black/5 dark:hover:bg-white/10"
          aria-label="Toggle menu"
          aria-expanded={open ? "true" : "false"}
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            {open ? (
              <path d="M18 6L6 18M6 6l12 12" />
            ) : (
              <path d="M3 6h18M3 12h18M3 18h18" />
            )}
          </svg>
        </button>

        {/* Right side actions */}
        <div className="ml-auto flex items-center gap-3">
          {status === "loading" ? (
            <div className="h-7 w-24 animate-pulse rounded-md bg-black/5 dark:bg-white/10" />
          ) : status === "authenticated" ? (
            <>
              <NavLink href="/dashboard" className="hidden sm:inline-block">
                Dashboard
              </NavLink>
              <Link
                href="/sell"
                className="rounded-lg bg-[#161748] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                Post
              </Link>
              <Link
                href={username ? `/store/${encodeURIComponent(username)}` : "/dashboard"}
                className="ml-1"
                aria-label="Your profile"
                title={username ? `@${username}` : "Profile"}
              >
                <UserAvatar
                  src={avatarSrc}
                  alt={user?.name || user?.email || "Me"}
                  size={32}
                />
              </Link>
            </>
          ) : (
            <>
              <NavLink href="/signin" className="hidden sm:inline-block">
                Sign in
              </NavLink>
              <Link
                href="/signup"
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
        <SearchBox placeholder="Search phones, cars, services…" />
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="bg-white/95 dark:bg-slate-900/95 sm:hidden border-t">
          <nav className="mx-auto grid max-w-6xl gap-1 px-4 py-3 text-sm" aria-label="Mobile">
            <NavLink href="/" exact className="py-2">
              Home
            </NavLink>
            <NavLink href="/sell" className="py-2">
              Sell
            </NavLink>
            <NavLink href="/search" className="py-2">
              Search
            </NavLink>
            <NavLink href="/saved" className="py-2">
              Saved
            </NavLink>
            {status === "authenticated" ? (
              <>
                <NavLink href="/dashboard" className="py-2">
                  Dashboard
                </NavLink>
                <Link
                  href={username ? `/store/${encodeURIComponent(username)}` : "/dashboard"}
                  className="rounded-md px-2 py-2 hover:bg-black/5 dark:hover:bg-white/10"
                  onClick={() => setOpen(false)}
                >
                  Your store/profile
                </Link>
              </>
            ) : (
              <>
                <NavLink href="/signin" className="py-2">
                  Sign in
                </NavLink>
                <Link
                  href="/signup"
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
