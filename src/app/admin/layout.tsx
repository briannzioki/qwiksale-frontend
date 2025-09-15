// src/app/admin/layout.tsx
import Link from "next/link";
import { requireAdmin } from "@/app/lib/authz"; // assumes you have this; see note below

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Redirect or throw if not admin
  await requireAdmin("/admin");

  return (
    <div className="min-h-screen">
      {/* Skip link for keyboard users */}
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
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="rounded-md bg-white/10 px-2 py-1 text-sm font-semibold hover:bg-white/15"
                aria-label="Back to site"
                title="Back to site"
              >
                ← Site
              </Link>
              <h1 className="text-xl font-extrabold tracking-tight">Admin</h1>
            </div>
            <nav aria-label="Admin navigation" className="flex gap-2 text-sm">
              <Link
                href="/admin/dashboard"
                className="rounded-xl bg-white/15 px-3 py-1 hover:bg-white/25 transition"
              >
                Dashboard
              </Link>
              <Link
                href="/admin/users"
                className="rounded-xl bg-white/15 px-3 py-1 hover:bg-white/25 transition"
              >
                Users
              </Link>
              <Link
                href="/admin/listings"
                className="rounded-xl bg-white/15 px-3 py-1 hover:bg-white/25 transition"
              >
                Listings
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main
        id="admin-main"
        role="main"
        className="mx-auto max-w-7xl px-6 py-6 space-y-6"
      >
        {children}
      </main>
    </div>
  );
}
