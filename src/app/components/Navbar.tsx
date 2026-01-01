// src/app/components/Navbar.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Icon } from "@/app/components/Icon";
import { Button } from "@/app/components/Button";
import { cx, pillClass, pillIconClass } from "@/app/components/ui/pill";

type NavbarProps = {
  searchSlot?: React.ReactNode;
  hideSellCta?: boolean;
  rightSlot?: React.ReactNode;
  showSaved?: boolean;
  showMessages?: boolean;
  sticky?: boolean;
};

export default function Navbar({
  searchSlot,
  hideSellCta = false,
  rightSlot,
  showSaved = true,
  showMessages = true,
  sticky = true,
}: NavbarProps) {
  const pathnameRaw = usePathname();
  const pathname = pathnameRaw || "/";
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    if (!sticky) return;
    const onScroll = () => setScrolled(window.scrollY > 2);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sticky]);

  const isActive = React.useCallback(
    (href: string) => pathname === href || pathname.startsWith(href + "/"),
    [pathname],
  );

  const browseActive = isActive("/search");

  return (
    <header
      data-testid="site-header"
      className={cx(sticky && "sticky top-0 z-header", "w-full")}
      role="banner"
    >
      <nav aria-label="Main">
        <div
          className={cx(
            "bg-[var(--bg-elevated)] text-[var(--text)]",
            "backdrop-blur-md supports-[backdrop-filter]:backdrop-blur-md",
            "border-b border-[var(--border-subtle)]",
            scrolled ? "shadow-soft" : "shadow-none",
            "transition-[box-shadow,background-color,backdrop-filter] duration-200",
          )}
        >
          <div className="container-page flex h-14 items-center gap-3 md:h-16">
            {/* Left */}
            <div className="flex min-w-0 items-center gap-2">
              {/* Logo */}
              <Link
                href="/"
                prefetch={false}
                className="flex shrink-0 items-center gap-2"
                aria-label="Home"
                title="Home"
                data-testid="home-link"
              >
                <span className="relative inline-flex h-8 w-8 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] shadow-inner">
                  <Image
                    src="/brand/qwiksale-logo.jpg"
                    alt="QwikSale logo"
                    fill
                    sizes="32px"
                    className="object-contain"
                    priority
                  />
                </span>
                <span className="text-sm font-extrabold tracking-tight text-[var(--text)] drop-shadow-sm md:text-base">
                  QwikSale
                </span>
              </Link>

              {/* Desktop Browse */}
              <Link
                href="/search"
                prefetch={false}
                className={cx(
                  "hidden md:inline-flex",
                  pillClass({ active: browseActive, size: "sm" }),
                )}
                aria-current={browseActive ? "page" : undefined}
                aria-label="Browse"
                title="Browse"
              >
                <Icon name="filter" />
                Browse
              </Link>
            </div>

            {/* Center: inline search */}
            <div className="hidden min-w-0 flex-1 justify-center md:flex">
              {searchSlot && <div className="w-full max-w-2xl">{searchSlot}</div>}
            </div>

            {/* Right */}
            <div className="ml-auto flex items-center gap-1 md:gap-2">
              <NavLink href="/" active={isActive("/")} ariaLabel="Home" title="Home">
                <Icon name="home" />
                <span className="hidden sm:inline">Home</span>
              </NavLink>

              {showSaved && (
                <NavLink
                  href="/saved"
                  active={isActive("/saved")}
                  ariaLabel="Saved"
                  title="Saved"
                >
                  <Icon name="heart" />
                  <span className="hidden sm:inline">Saved</span>
                </NavLink>
              )}

              {showMessages && (
                <NavLink
                  href="/messages"
                  active={isActive("/messages")}
                  ariaLabel="Messages"
                  title="Messages"
                >
                  <Icon name="message" />
                  <span className="hidden sm:inline">Messages</span>
                </NavLink>
              )}

              {!hideSellCta && (
                <Button asChild size="sm" className="hidden md:inline-flex">
                  <Link href="/post" prefetch={false} aria-label="Sell" title="Sell">
                    <Icon name="add" />
                    Sell
                  </Link>
                </Button>
              )}

              {/* Mobile search icon */}
              <Link
                href="/search"
                prefetch={false}
                className={cx("md:hidden", pillIconClass({ active: browseActive }))}
                aria-label="Search"
                title="Search"
                aria-current={browseActive ? "page" : undefined}
              >
                <Icon name="search" />
              </Link>

              {!hideSellCta && (
                <Link
                  href="/post"
                  prefetch={false}
                  className={cx("md:hidden", pillIconClass({ active: false }))}
                  aria-label="Sell"
                  title="Sell"
                >
                  <Icon name="add" />
                </Link>
              )}

              {rightSlot}
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}

function NavLink({
  href,
  active,
  ariaLabel,
  title,
  children,
}: {
  href: string;
  active?: boolean;
  ariaLabel?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const isOn = !!active;
  return (
    <Link
      href={href}
      prefetch={false}
      className={pillClass({ active: isOn, size: "sm" })}
      aria-current={isOn ? "page" : undefined}
      aria-label={ariaLabel}
      title={title}
    >
      {children}
    </Link>
  );
}
