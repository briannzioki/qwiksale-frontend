// src/app/admin/layout.tsx
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "@/app/lib/authz";
import { AdminNav, type NavItem } from "@/app/admin/_components/AdminNav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Admin · QwikSale",
  description: "Admin tools for QwikSale moderators and team.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/admin" },
};

type Props = {
  children: ReactNode;
};

const EXTRA_ADMIN_ITEMS: readonly NavItem[] = [
  {
    href: "/admin/moderation",
    label: "Moderation",
    icon: "shield",
  },
  {
    href: "/admin/reveals",
    label: "Contact reveals",
    icon: "eye",
  },
] as const;

export default async function AdminLayout({ children }: Props) {
  // Hard SSR gate – if this fails you go to /signin?callbackUrl=/admin
  await requireAdmin();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Skip link for keyboard users */}
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground shadow"
      >
        Skip to main content
      </a>

      {/* Top header */}
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              prefetch={false}
              className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground hover:border-border/80 hover:bg-muted"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Back to site</span>
            </Link>
            <div>
              <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                QwikSale
              </div>
              <h1 className="text-lg font-bold text-foreground">
                Admin console
              </h1>
              <p className="text-xs text-muted-foreground">
                For moderators and trusted team members only.
              </p>
            </div>
          </div>

          {/* Mobile nav (collapsible) */}
          <div className="flex items-center gap-3 lg:hidden">
            <details className="group relative">
              <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-border/80 hover:bg-muted">
                <span>Admin menu</span>
                <span
                  aria-hidden
                  className="transition-transform group-open:rotate-180"
                >
                  ▾
                </span>
              </summary>
              <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-border bg-card/95 p-2 shadow-lg backdrop-blur">
                <AdminNav items={EXTRA_ADMIN_ITEMS} className="text-sm" />
              </div>
            </details>
          </div>
        </div>
      </header>

      {/* Body: sidebar + main */}
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Sidebar (desktop) */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-20 space-y-4">
            <AdminNav items={EXTRA_ADMIN_ITEMS} />
            <p className="text-[11px] leading-snug text-muted-foreground">
              Tip: bookmark{" "}
              <span className="font-mono text-foreground">
                /admin
              </span>{" "}
              or pin it for quick access to your tools.
            </p>
          </div>
        </aside>

        {/* Main content */}
        <main
          id="admin-main"
          className="min-w-0 flex-1 space-y-6 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6"
        >
          {children}
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-background/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 text-xs text-muted-foreground sm:px-6 lg:px-8">
          <div>QwikSale admin · Internal use only</div>
          <div className="flex flex-wrap items-center gap-2">
            <span>Audit logging enabled where applicable.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
