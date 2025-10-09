// src/app/admin/layout.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/app/lib/authz";

export const metadata: Metadata = {
  title: "Admin · QwikSale",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  themeColor: "#161748",
};

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "gauge" },
  { href: "/admin/users", label: "Users", icon: "users" },
  { href: "/admin/listings", label: "Listings", icon: "grid" },
  { href: "/admin/moderation", label: "Moderation", icon: "shield" },
  { href: "/admin/reveals", label: "Reveals", icon: "eye" },
] as const;

function Icon({ name, className = "size-4" }: { name: typeof NAV[number]["icon"] | "home"; className?: string }) {
  // lightweight inline icons (no extra deps)
  const paths: Record<string, string> = {
    home: "M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-10.5Z",
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

function NavLink({ href, label, icon }: (typeof NAV)[number]) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      <Icon name={icon} />
      <span>{label}</span>
      <span className="sr-only">section</span>
    </Link>
  );
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // central server gate (no duplication in child pages)
  await requireAdmin("/admin");

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Skip link */}
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:fixed focus:z-[100] focus:top-3 focus:left-3 focus:bg-white focus:text-[#161748] focus:px-3 focus:py-2 focus:rounded-lg focus:shadow"
      >
        Skip to content
      </a>

      {/* Top bar */}
      <header
        className="sticky top-0 z-30 bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] text-white shadow"
        aria-label="Admin header"
      >
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex h-14 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="rounded-md bg-white/10 px-2 py-1 text-sm font-semibold hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                aria-label="Back to site"
                title="Back to site"
              >
                <span className="inline-flex items-center gap-1">
                  <Icon name="home" className="size-4" /> Site
                </span>
              </Link>
              <span className="text-lg font-extrabold tracking-tight">Admin</span>
            </div>
            {/* mobile menu uses details/summary (no JS) */}
            <details className="lg:hidden">
              <summary className="list-none cursor-pointer rounded-md px-2 py-1 text-sm font-semibold hover:bg-white/15">
                Menu
              </summary>
              <nav className="mt-2 grid gap-1 rounded-xl bg-white/10 p-2 backdrop-blur">
                {NAV.map((item) => (
                  <NavLink key={item.href} {...item} />
                ))}
              </nav>
            </details>
          </div>
        </div>
      </header>

      {/* Body: sticky sidebar + content */}
      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-[4.5rem] space-y-4">
              <nav aria-label="Admin navigation" className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                {NAV.map((item) => (
                  <NavLink key={item.href} {...item} />
                ))}
              </nav>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                Tip: use the <span className="font-semibold">Dashboard</span> for quick metrics. Listings &amp; Moderation
                let you feature, unlist, or remove content.
              </div>
            </div>
          </aside>

          <main
            id="admin-main"
            role="main"
            className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            {children}
          </main>
        </div>
      </div>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500 dark:border-slate-800">
        QwikSale Admin • {new Date().getFullYear()}
      </footer>
    </div>
  );
}
