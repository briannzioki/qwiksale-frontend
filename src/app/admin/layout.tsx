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

function AccessDenied({
  status,
  callbackUrl,
}: {
  status: 401 | 403;
  callbackUrl: string;
}) {
  const isForbidden = status === 403;

  const title = isForbidden ? "Forbidden" : "Unauthorized";
  const body = isForbidden
    ? "You don’t have permission to access this area."
    : "Please sign in to continue.";

  const ctaHref = isForbidden ? "/dashboard" : `/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  const ctaLabel = isForbidden ? "Go to dashboard" : "Sign in";

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--text)]">
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 shadow-soft">
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--text)]">{title}</h1>

          {/* IMPORTANT: include keywords tests look for (Unauthorized/Forbidden) */}
          <p className="mt-2 text-sm text-[var(--text-muted)]">{body}</p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link
              href={ctaHref}
              prefetch={false}
              className="btn-gradient-primary inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 ring-focus active:scale-[.99]"
            >
              {ctaLabel}
            </Link>

            <Link
              href="/"
              prefetch={false}
              className="btn-outline inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 ring-focus active:scale-[.99]"
            >
              Back home
            </Link>
          </div>
        </div>

        <div className="text-xs text-[var(--text-muted)]">
          If you believe this is a mistake, contact a team member to request access.
        </div>
      </main>
    </div>
  );
}

export default async function AdminLayout({ children }: Props) {
  // ✅ Use result-mode so non-admin does NOT trigger Next's __next-page-redirect meta refresh.
  const gate = await requireAdmin({
    mode: "result",
    callbackUrl: "/admin",
    adminFallbackHref: "/dashboard",
  });

  if (!gate.authorized) {
    // 401 vs 403 are handled differently in middleware for document navigations,
    // but rendering an immediate UI here prevents Playwright from seeing a 200 + meta-refresh.
    return <AccessDenied status={gate.status} callbackUrl="/admin" />;
  }

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--text)]">
      {/* Skip link for keyboard users */}
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1 text-sm font-medium text-[var(--text)] shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
      >
        Skip to main content
      </a>

      {/* Top header */}
      <header className="border-b border-[var(--border-subtle)] bg-[var(--bg)]/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              prefetch={false}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-1 text-xs font-medium text-[var(--text)] transition hover:border-[var(--border)] hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 ring-focus"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]" />
              <span>Back to site</span>
            </Link>
            <div>
              <div className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                QwikSale
              </div>
              <h1 className="text-lg font-bold text-[var(--text)]">Admin console</h1>
              <p className="text-xs text-[var(--text-muted)]">
                For moderators and trusted team members only.
              </p>
            </div>
          </div>

          {/* Mobile nav (collapsible) */}
          <div className="flex items-center gap-3 lg:hidden">
            <details className="group relative">
              <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition hover:border-[var(--border)] hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 ring-focus">
                <span>Admin menu</span>
                <span aria-hidden className="transition-transform group-open:rotate-180">
                  ▾
                </span>
              </summary>
              <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 p-2 shadow-lg backdrop-blur">
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
            <p className="text-[11px] leading-snug text-[var(--text-muted)]">
              Tip: bookmark <span className="font-mono text-[var(--text)]">/admin</span> or pin it
              for quick access to your tools.
            </p>
          </div>
        </aside>

        {/* Main content */}
        <main
          id="admin-main"
          className="min-w-0 flex-1 space-y-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-sm sm:p-6"
        >
          {children}
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg)]/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 text-xs text-[var(--text-muted)] sm:px-6 lg:px-8">
          <div>QwikSale admin · Internal use only</div>
          <div className="flex flex-wrap items-center gap-2">
            <span>Audit logging enabled where applicable.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
