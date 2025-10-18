// src/app/components/SiteHeader.tsx
import Link from "next/link";
import Image from "next/image";
import { auth } from "@/auth";
import RoleChip from "@/app/components/RoleChip";

export default async function SiteHeader() {
  const session = await auth().catch(() => null);
  const u = (session?.user || {}) as any;
  const role = (u.role as string | undefined) || null;
  const subscription = (u.subscription as string | undefined) || null;

  const isAdmin = (role || "").toUpperCase() === "ADMIN" || (role || "").toUpperCase() === "SUPERADMIN";

  return (
    <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
        {/* Left: brand */}
        <div className="flex items-center gap-3">
          <Link href="/" className="text-base font-extrabold tracking-tight text-[#161748] dark:text-white" prefetch={false}>
            QwikSale
          </Link>

          {/* Primary nav — only public items here */}
          <nav className="hidden md:flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <Link href="/sell" className="rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800" prefetch={false}>
              Sell
            </Link>
            <Link href="/search" className="rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800" prefetch={false}>
              Search
            </Link>
            {/* Show Admin entry only if viewer is admin */}
            {isAdmin && (
              <Link
                href="/admin"
                className="rounded px-2 py-1 text-blue-700 ring-1 ring-inset ring-blue-300 hover:bg-blue-50 dark:text-blue-200 dark:ring-blue-700/60 dark:hover:bg-blue-950/30"
                prefetch={false}
              >
                Admin
              </Link>
            )}
          </nav>
        </div>

        {/* Right: account pill */}
        <div className="flex items-center gap-2">
          {/* Role/Plan chip: ADMIN replaces plan */}
          <RoleChip role={role} subscription={subscription} />

          {u?.email ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full border px-2 py-1 text-sm hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
              prefetch={false}
              title={u.email as string}
            >
              {u.image ? (
                <Image
                  src={u.image}
                  alt=""
                  width={24}
                  height={24}
                  className="rounded-full"
                />
              ) : (
                <span className="inline-grid size-6 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {(u.name || u.email || "?").slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="hidden sm:inline">{u.name || u.email}</span>
            </Link>
          ) : (
            <Link href="/signin" className="btn-gradient-primary text-sm" prefetch={false}>
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
