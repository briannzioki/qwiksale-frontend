// src/app/admin/layout.tsx (or wherever your AdminLayout lives)
import Link from "next/link";
import { requireAdmin } from "@/app/lib/authz";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Redirects or throws if not admin
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
        className="sticky top-0 z-30 bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] text-white"
        aria-label="Admin header"
      >
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-extrabold">Admin</h1>
            <nav aria-label="Admin navigation" className="flex gap-2">
              <Link
                href="/admin"
                className="rounded-xl bg-white/15 px-3 py-1 hover:bg-white/25 transition"
              >
                Dashboard
              </Link>
              <Link
                href="/"
                className="rounded-xl bg-white/15 px-3 py-1 hover:bg-white/25 transition"
              >
                Site
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main id="admin-main" role="main" className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {children}
      </main>
    </div>
  );
}
