// src/app/admin/_components/AdminNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

type IconName = "gauge" | "users" | "grid" | "shield" | "eye";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
};

function Icon({
  name,
  className = "size-4",
}: {
  name: IconName;
  className?: string;
}) {
  const paths: Record<IconName, string> = {
    gauge:
      "M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8.94 1.06A10 10 0 1 0 4.06 14.06l1.42-1.42A8 8 0 1 1 18.52 12l1.42 1.42ZM11 22h2v-5h-2v5Z",
    users:
      "M16 14a4 4 0 1 0-8 0v2H3v3h18v-3h-5v-2Zm-4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    grid:
      "M3 3h8v8H3V3Zm10 0h8v8h-8V3ZM3 13h8v8H3v-8Zm10 0h8v8h-8v-8Z",
    shield:
      "M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Z",
    eye: "M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Zm11 4a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d={paths[name]} />
    </svg>
  );
}

function isActive(pathname: string | null, href: string) {
  if (!pathname || !href) return false;
  if (pathname === href) return true;
  // Treat section root as active for nested pages, e.g. /admin/users/*
  return pathname.startsWith(href + "/");
}

function isValidAdminHref(href: string | undefined | null): href is string {
  if (!href) return false;
  const s = href.trim().toLowerCase();
  if (!s.startsWith("/admin")) return false;
  if (s.startsWith("javascript:")) return false;
  return true;
}

// Hard-required admin routes for specs + flows.
const REQUIRED_ITEMS: NavItem[] = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: "gauge",
  },
  {
    href: "/admin/users",
    label: "Users",
    icon: "users",
  },
  {
    href: "/admin/listings",
    label: "Listings",
    icon: "grid",
  },
  {
    href: "/admin/requests",
    label: "Requests",
    icon: "eye",
  },
];

export const ADMIN_NAV_REQUIRED_ITEMS: readonly NavItem[] = REQUIRED_ITEMS;

type Props = {
  /**
   * Optional extra nav items.
   * Only real /admin/... links are rendered; others are ignored.
   * Required core links are always present.
   */
  items?: readonly NavItem[];
  className?: string;
};

export function AdminNav({ items, className = "" }: Props) {
  const pathname = usePathname();

  // Start from caller-provided items (if any),
  // but only keep safe /admin/... hrefs.
  const initial = Array.isArray(items) ? [...items] : [];
  const byHref = new Map<string, NavItem>();

  for (const item of initial) {
    if (!item) continue;
    if (!isValidAdminHref(item.href)) continue;
    if (!byHref.has(item.href)) {
      byHref.set(item.href, item);
    }
  }

  // Ensure required links exist.
  for (const required of REQUIRED_ITEMS) {
    if (!byHref.has(required.href)) {
      byHref.set(required.href, required);
    }
  }

  // Stable order: required first (in REQUIRED_ITEMS order), then extras.
  const mergedItems = Array.from(byHref.values()).sort((a, b) => {
    const ia = REQUIRED_ITEMS.findIndex((r) => r.href === a.href);
    const ib = REQUIRED_ITEMS.findIndex((r) => r.href === b.href);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.href.localeCompare(b.href);
  });

  return (
    <nav
      aria-label="Admin navigation"
      className={`flex flex-col gap-1 ${className}`}
    >
      {mergedItems.map(({ href, label, icon }) => {
        const active = isActive(pathname, href);

        const base =
          "group flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus";

        const inactive =
          "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]";

        const activeCls =
          "border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text)]";

        return (
          <Link
            key={href}
            href={href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className={`${base} ${active ? activeCls : inactive}`}
          >
            <Icon name={icon} />
            <span>{label}</span>
            <span className="sr-only">section</span>
          </Link>
        );
      })}
    </nav>
  );
}
