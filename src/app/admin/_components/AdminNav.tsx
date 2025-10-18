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

function Icon({ name, className = "size-4" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, string> = {
    gauge: "M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8.94 1.06A10 10 0 1 0 4.06 14.06l1.42-1.42A8 8 0 1 1 18.52 12l1.42 1.42ZM11 22h2v-5h-2v5Z",
    users: "M16 14a4 4 0 1 0-8 0v2H3v3h18v-3h-5v-2Zm-4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    grid: "M3 3h8v8H3V3Zm10 0h8v8h-8V3ZM3 13h8v8H3v-8Zm10 0h8v8h-8v-8Z",
    shield: "M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Z",
    eye: "M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Zm11 4a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d={paths[name]} />
    </svg>
  );
}

function isActive(pathname: string, href: string) {
  if (!pathname || !href) return false;
  if (pathname === href) return true;
  // Treat section root as active for nested pages, e.g. /admin/users/*
  return pathname.startsWith(href + "/");
}

export function AdminNav({ items, className = "" }: { items: readonly NavItem[]; className?: string }) {
  const pathname = usePathname();

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {items.map(({ href, label, icon }) => {
        const active = isActive(pathname, href);
        const base =
          "group flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";
        const inactive =
          "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
        const activeCls =
          "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200/60 " +
          "dark:bg-indigo-950/40 dark:text-indigo-200 dark:ring-indigo-800/50";

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
    </div>
  );
}
