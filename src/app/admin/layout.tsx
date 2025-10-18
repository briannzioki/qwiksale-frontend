// src/app/admin/layout.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/app/lib/authz";
import { AdminNav, type NavItem } from "./_components/AdminNav";
import { auth } from "@/auth";
import RoleChip from "@/app/components/RoleChip";

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

const NAV: readonly NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "gauge" },
  { href: "/admin/users", label: "Users", icon: "users" },
  { href: "/admin/listings", label: "Listings", icon: "grid" },
  { href: "/admin/moderation", label: "Moderation", icon: "shield" },
  { href: "/admin/reveals", label: "Reveals", icon: "eye" },
] as const;

function HomeIcon({ className = "size-4" }: { className?: string }) {
  const path = "M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-10.5Z";
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d={path} />
    </svg>
  );
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin("/admin");

  const session = await auth().catch(() => null);
  const role = (session?.user as any)?.role ?? null;
  const subscription = (session?.user as any)?.subscription ?? null;

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:fixed focus:z-[100] focus:top-3 focus:left-3 focus:bg-white focus:text-[#161748] focus:px-3 focus:py-2 focus:rounded-lg focus:shadow"
      >
        Skip to content
      </a>

      <header
        className="sticky top-0 z-30 bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] text-white shadow"
        aria-label="Admin header"
      >
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex h-14 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                prefetch={false}
                className="rounded-md bg-white/10 px-2 py-1 text-sm font-semibold hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                aria-label="Back to site"
                title="Back to site"
              >
                <span className="inline-flex items-center gap-1">
                  <HomeIcon className="size-4" /> Site
                </span>
              </Link>
              <span className="text-lg font-extrabold tracking-tight">Admin</span>
            </div>

            {/* Right: ADMIN chip (replaces plan) */}
            <div className="hidden md:flex items-center">
              <RoleChip role={role} subscription={subscription} />
            </div>

            <details className="lg:hidden">
              <summary className="list-none cursor-pointer rounded-md px-2 py-1 text-sm font-semibold hover:bg-white/15">
                Menu
              </summary>
              <nav className="mt-2 grid gap-1 rounded-xl bg-white/10 p-2 backdrop-blur">
                <AdminNav items={NAV} />
              </nav>
            </details>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-[4.5rem] space-y-4">
              <nav
                aria-label="Admin navigation"
                className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <AdminNav items={NAV} />
              </nav>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                Tip: use the <span className="font-semibold">Dashboard</span> for quick metrics. Listings &amp;
                Moderation let you feature, unlist, or remove content.
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
