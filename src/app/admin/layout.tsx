// src/app/admin/layout.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { requireAdmin } from "@/app/lib/authz";

export const metadata: Metadata = {
  title: "Admin · QwikSale",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#161748",
};

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdmin();

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
                className="rounded-md bg-white/10 px-2 py-1 text-sm font-semibold hover:bg:white/15"
                aria-label="Back to site"
                title="Back to site"
              >
                Site
              </Link>
              <span className="text-lg font-extrabold tracking-tight">
                Admin
              </span>
            </div>

            <details className="lg:hidden">
              <summary className="list-none cursor-pointer rounded-md px-2 py-1 text-sm font-semibold hover:bg-white/15">
                Menu
              </summary>
              <nav
                className="mt-2 grid gap-1 rounded-xl bg-white/10 p-2 backdrop-blur"
                aria-label="Admin navigation"
              >
                <AdminLink href="/admin">Dashboard</AdminLink>
                <AdminLink href="/admin/users">Users</AdminLink>
                <AdminLink href="/admin/listings">Listings</AdminLink>
              </nav>
            </details>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-[4.5rem] space-y-4">
              <nav
                aria-label="Admin navigation"
                className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <ul className="space-y-1">
                  <li>
                    <AdminLink href="/admin">Dashboard</AdminLink>
                  </li>
                  <li>
                    <AdminLink href="/admin/users">Users</AdminLink>
                  </li>
                  <li>
                    <AdminLink href="/admin/listings">Listings</AdminLink>
                  </li>
                </ul>
              </nav>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                Tip: use{" "}
                <span className="font-semibold">Dashboard</span> for quick
                metrics. Use{" "}
                <span className="font-semibold">Listings</span> to feature or
                unlist content.
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

function AdminLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
      aria-label={typeof children === "string" ? children : undefined}
    >
      {children}
    </a>
  );
}
