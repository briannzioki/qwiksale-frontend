"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Icon } from "@/app/components/Icon";
import { Button } from "@/app/components/Button";

type NavbarProps = {
  searchSlot?: React.ReactNode;
  hideSellCta?: boolean;
  rightSlot?: React.ReactNode;
  showSaved?: boolean;
  showMessages?: boolean;
  sticky?: boolean;
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function Navbar({
  searchSlot,
  hideSellCta = false,
  rightSlot,
  showSaved = true,
  showMessages = true,
  sticky = true,
}: NavbarProps) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = React.useState(false);

  // Sticky shadow on scroll
  React.useEffect(() => {
    if (!sticky) return;
    const onScroll = () => setScrolled(window.scrollY > 2);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sticky]);

  const isActive = React.useCallback(
    (href: string) =>
      pathname === href ? true : pathname?.startsWith(href + "/"),
    [pathname],
  );

  const openCategories = React.useCallback(() => {
    window.dispatchEvent(new CustomEvent("qs:categories:open"));
  }, []);

  return (
    <div
      className={cx(sticky && "sticky top-0 z-header", "w-full")}
      role="navigation"
      aria-label="Main"
    >
      <div
        className={cx(
          "bg-white/60 dark:bg-slate-950/80 backdrop-blur-md supports-[backdrop-filter]:bg-slate-950/70",
          "border-b border-black/5 dark:border-white/5",
          scrolled ? "shadow-sm" : "shadow-none",
          "transition-[box-shadow,background-color,backdrop-filter] duration-200",
        )}
      >
        <div className="container-page flex h-14 items-center gap-3 md:h-16">
          {/* Left */}
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200/70 bg-white/60 hover:bg-white/80 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 transition md:hidden"
              onClick={openCategories}
              aria-label="Open categories"
            >
              <Icon name="refine" />
            </button>

            <Link
              href="/"
              className="flex shrink-0 items-center gap-2"
              prefetch={false}
            >
              <span className="relative inline-flex h-8 w-8 overflow-hidden rounded-xl border border-white/20 bg-slate-950 shadow-inner">
                <Image
                  src="/brand/qwiksale-logo.jpg"
                  alt="QwikSale logo"
                  fill
                  sizes="32px"
                  className="object-contain"
                  priority
                />
              </span>
              <span className="text-sm font-extrabold tracking-tight text-slate-900 drop-shadow-sm dark:text-white md:text-base">
                QwikSale
              </span>
            </Link>

            <button
              type="button"
              className={cx(
                "hidden md:inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-medium",
                "text-gray-700 hover:text-gray-900 dark:text-slate-200 dark:hover:text-white",
                "border border-transparent hover:border-gray-200 dark:hover:border-white/10",
                "transition",
              )}
              onClick={openCategories}
            >
              <Icon name="filter" />
              Browse
            </button>
          </div>

          {/* Center: canonical header inline search */}
          <div className="hidden min-w-0 flex-1 justify-center md:flex">
            {searchSlot && <div className="w-full max-w-2xl">{searchSlot}</div>}
          </div>

          {/* Right: nav & CTAs */}
          <div className="ml-auto flex items-center gap-1 md:gap-2">
            <NavLink href="/" active={isActive("/")}>
              <Icon name="home" />
              <span className="hidden sm:inline">Home</span>
            </NavLink>

            {showSaved && (
              <NavLink href="/saved" active={isActive("/saved")}>
                <Icon name="heart" />
                <span className="hidden sm:inline">Saved</span>
              </NavLink>
            )}

            {showMessages && (
              <NavLink href="/messages" active={isActive("/messages")}>
                <Icon name="message" />
                <span className="hidden sm:inline">Messages</span>
              </NavLink>
            )}

            {!hideSellCta && (
              <Button asChild size="sm" className="hidden md:inline-flex">
                <Link href="/post" prefetch={false}>
                  <Icon name="add" />
                  Sell
                </Link>
              </Button>
            )}

            {/* Mobile search icon (separate from inline search form) */}
            <Link
              href="/search"
              prefetch={false}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200/70 bg-white/60 hover:bg-white/80 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 transition md:hidden"
              aria-label="Search"
            >
              <Icon name="search" />
            </Link>

            {!hideSellCta && (
              <Link
                href="/post"
                prefetch={false}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200/70 bg-white/60 hover:bg-white/80 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 transition md:hidden"
                aria-label="Sell"
              >
                <Icon name="add" />
              </Link>
            )}

            {rightSlot}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={cx(
        "relative inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-medium transition",
        "text-gray-700 hover:text-gray-900 dark:text-slate-200 dark:hover:text-white",
        "border border-transparent hover:border-gray-200 dark:hover:border-white/10",
        active &&
          "bg-white/70 text-gray-900 border-gray-200 dark:bg-white/10 dark:text-white dark:border-white/10",
      )}
      aria-current={active ? "page" : undefined}
    >
      <span
        className={cx(
          "absolute -bottom-[7px] left-2 right-2 h-[2px] rounded-full",
          active
            ? "bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]"
            : "bg-transparent",
        )}
        aria-hidden="true"
      />
      {children}
    </Link>
  );
}
