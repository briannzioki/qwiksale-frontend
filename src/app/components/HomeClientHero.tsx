// src/app/components/HomeClientHero.tsx
"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import type { Session } from "next-auth";
import { useMemo } from "react";
import { categories } from "../data/categories";

/* ------------------------ tiny event/analytics ------------------------ */
function emit(name: string, detail?: unknown) {
  // eslint-disable-next-line no-console
  console.log(`[qs:event] ${name}`, detail);
  if (typeof window !== "undefined" && "CustomEvent" in window) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}
function track(event: string, payload?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.log("[qs:track]", event, payload);
  emit("qs:track", { event, payload });
}

/* ----------------------------- types ---------------------------------- */
type LeafName = string;
type Subcategory = { name: string; subsubcategories?: ReadonlyArray<LeafName> };
type Category = { name: string; subcategories?: ReadonlyArray<Subcategory> };

function isCategory(x: unknown): x is Category {
  return !!x && typeof (x as any).name === "string";
}

/* --------------------------- helpers ---------------------------------- */
function categoryHref(value: string) {
  return `/?category=${encodeURIComponent(value)}`;
}

function pickTopCategoryNames(max = 8) {
  // categories is an array from ../data/categories; keep it defensive
  const names: string[] = [];
  for (const c of categories as unknown as Category[]) {
    if (isCategory(c)) names.push(c.name);
    if (names.length >= max) break;
  }
  return names.slice(0, max);
}

/* --------------------------- component -------------------------------- */
export default function HomeClientHero({ className = "" }: { className?: string }) {
  const { data: session, status } = useSession();

  // ✅ Null-safe user shape with optional username, matching your auth callbacks
  const user = (session?.user ?? null) as (Session["user"] & {
    username?: string | null;
  }) | null;

  const greeting = useMemo(() => {
    if (status === "loading") return "Welcome";
    const name = user?.name || user?.email || user?.username || "";
    if (!name) return "Welcome";
    const first = String(name).split(/\s+/)[0] || "there";
    return `Hi, ${first}`;
  }, [status, user?.email, user?.name, user?.username]);

  const topCats = useMemo(() => pickTopCategoryNames(10), []);

  return (
    <div className="p-6 space-y-6">
      {/* Signed-in hello + quick actions */}
      <HomeClientHero />

      {/* Newest / header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Newest Listings</h2>
        <div className="flex items-center gap-2">
          <Link href="/search" className="text-sm text-[#39a0ca] underline">
            Explore all →
          </Link>
        </div>
      </div>

          {/* Trust mini-row */}
          <ul className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-slate-400">
            <li className="inline-flex items-center gap-1">
              <ShieldIcon /> Buyer safety
            </li>
            <li className="inline-flex items-center gap-1">
              <StarIcon /> Community rated
            </li>
            <li className="inline-flex items-center gap-1">
              <BoltIcon /> Fast messaging
            </li>
          </ul>
        </div>

        {/* Quick category chips */}
        <nav aria-label="Popular categories" className="md:justify-self-end">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
            Popular now
          </div>
          <ul className="mt-2 flex max-w-[36rem] flex-wrap gap-2">
            {topCats.map((name) => (
              <li key={name}>
                <Link
                  href={categoryHref(name)}
                  onClick={() => track("hero_category_click", { category: name })}
                  className="inline-flex items-center rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-sm text-gray-900 hover:bg-white dark:border-white/20 dark:bg-white/10 dark:text-slate-100"
                >
                  {name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}

/* ---------------- tiny inline icons ---------------- */

function ShieldIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M12 3l7 3v6a9 9 0 0 1-7 8 9 9 0 0 1-7-8V6l7-3z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
function StarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 17.27l5.18 3.05-1.4-6.03 4.64-4.02-6.12-.53L12 4 9.7 9.74l-6.12.53 4.64 4.02-1.4 6.03L12 17.27z" />
    </svg>
  );
}
function BoltIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M13 2 3 14h7l-1 8 11-14h-7V2z" />
    </svg>
  );
}
