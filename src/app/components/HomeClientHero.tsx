// src/app/components/HomeClientHero.tsx
"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import type { Session } from "next-auth";
import { useEffect, useMemo, useState } from "react";
import { categories } from "../data/categories";
import IconButton from "@/app/components/IconButton";

/* ------------------------ tiny event/analytics ------------------------ */
function emit(name: string, detail?: unknown) {
  try {
    // eslint-disable-next-line no-console
    console.log(`[qs:event] ${name}`, detail);
    if (typeof window !== "undefined" && "CustomEvent" in window) {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    }
  } catch {}
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
const isCategory = (x: unknown): x is Category =>
  !!x && typeof (x as any).name === "string";

/* --------------------------- helpers ---------------------------------- */
const categoryHref = (value: string) =>
  `/?category=${encodeURIComponent(value)}`;

function pickTopCategoryNames(max = 10) {
  const names: string[] = [];
  for (const c of categories as unknown as Category[]) {
    if (isCategory(c)) names.push(c.name);
    if (names.length >= max) break;
  }
  return (names.length
    ? names
    : ["Phones", "Cars", "Laptops", "Furniture", "Home services"]
  ).slice(0, max);
}

function getReturnTo(): string {
  try {
    const { pathname, search, hash } = window.location;
    return `${pathname}${search || ""}${hash || ""}` || "/";
  } catch {
    return "/";
  }
}

/* --------------------------- component -------------------------------- */
export default function HomeClientHero({
  className = "",
}: {
  className?: string;
}) {
  const { data: session, status } = useSession();
  const [authedSignal, setAuthedSignal] = useState(false);

  // Observe body-level auth flag and header account menu so we can reliably
  // decide whether to hide the hero's auth CTA in authed scenarios.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    if (!body) return;

    const update = () => {
      const hasBodyFlag = body.dataset["qsSession"] === "authed";
      const hasAccountMenu = !!document.querySelector(
        '[data-testid="account-menu-trigger"]',
      );
      setAuthedSignal(hasBodyFlag || hasAccountMenu);
    };

    update();

    const observer = new MutationObserver(() => {
      update();
    });

    observer.observe(body, {
      attributes: true,
      attributeFilter: ["data-qs-session"],
    });

    return () => observer.disconnect();
  }, []);

  const user = (session?.user ?? null) as
    | (Session["user"] & {
        username?: string | null;
      })
    | null;

  const isAppAuthed = status === "authenticated" || authedSignal;

  const greeting = useMemo(() => {
    if (status === "loading") return "Welcome";
    const name = user?.name || user?.email || user?.username || "";
    if (!name) return "Welcome";
    const first = String(name).split(/\s+/)[0] || "there";
    return `Hi, ${first}`;
  }, [status, user?.email, user?.name, user?.username]);

  const topCats = useMemo(() => pickTopCategoryNames(10), []);

  // Prefetch a few high-traffic routes to feel snappy
  useEffect(() => {
    try {
      // @ts-ignore
      (globalThis as any)?.router?.prefetch?.("/search");
    } catch {}
  }, []);

  const signInHref = `/signin?callbackUrl=${encodeURIComponent(getReturnTo())}`;

  return (
    <section
      aria-label="Welcome hero"
      className={[
        "relative overflow-hidden rounded-2xl border border-black/5 dark:border-white/10",
        "bg-gradient-to-br from-[#e6f6fd] via-[#eaf7f0] to-[#f0effa] dark:from-slate-900 dark:via-slate-900 dark:to-slate-950",
        "p-5 md:p-6",
        "shadow-soft",
        className,
      ].join(" ")}
    >
      {/* Decorative blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full opacity-40 md:blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, #39a0ca 0%, transparent 60%), radial-gradient(closest-side, #478559 0%, transparent 60%)",
          willChange: "transform, opacity",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 -bottom-20 h-48 w-48 rounded-full opacity-30 md:blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, #161748 0%, transparent 60%), radial-gradient(closest-side, #f95d9b 0%, transparent 60%)",
          willChange: "transform, opacity",
        }}
      />

      <div className="relative z-10 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <h1
            className="mt-1 text-xl font-extrabold tracking-tight text-[#161748] dark:text-white text-balance"
            aria-live="polite"
          >
            {greeting} — buy &amp; sell, faster.
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-700 dark:text-slate-300">
            Browse fresh deals across Kenya. Post your own listing in seconds
            and reach local buyers.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href="/sell"
              prefetch
              onClick={() => track("hero_sell_click")}
              className="btn-gradient-hero"
            >
              + Post a listing
            </Link>

            <Link
              href="/search"
              prefetch
              onClick={() => track("hero_browse_click")}
              className="btn-outline"
            >
              Browse all
            </Link>

            {isAppAuthed ? (
              <>
                <Link
                  href="/saved"
                  prefetch
                  onClick={() => track("hero_saved_click")}
                  aria-label="Favorites"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-black/10 bg-white/60 transition hover:bg-white/80 dark:border-white/10 dark:bg-slate-900/50 dark:hover:bg-slate-900/70"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="currentColor"
                    aria-hidden="true"
                    className="text-pink-600 dark:text-pink-400"
                  >
                    <path d="M12 21s-7.5-4.35-10-8.5C-0.5 8 2 4 6 4c2.14 0 3.57 1.07 4.5 2.3C11.43 5.07 12.86 4 15 4c4 0 6.5 4 4 8.5C19.5 16.65 12 21 12 21z" />
                  </svg>
                </Link>

                <Link
                  href="/dashboard"
                  prefetch
                  onClick={() => track("hero_dashboard_click")}
                  className="contents"
                >
                  <IconButton
                    icon="settings"
                    variant="outline"
                    labelText="Dashboard"
                    srLabel="Dashboard"
                  />
                </Link>

                {!user?.username && (
                  <Link
                    href="/account/complete-profile"
                    prefetch
                    onClick={() => track("hero_complete_profile_click")}
                    className="inline-flex items-center rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200"
                    title="Set your username & profile details"
                  >
                    Complete profile
                  </Link>
                )}
              </>
            ) : (
              <>
                <Link
                  href={signInHref}
                  prefetch
                  aria-label="Sign in to QwikSale"
                  onClick={() => track("hero_signin_click")}
                  className="btn-outline"
                >
                  Sign in to QwikSale
                </Link>
                <Link
                  href="/signup"
                  prefetch
                  onClick={() => track("hero_join_click")}
                  className="btn-outline"
                >
                  Join
                </Link>
              </>
            )}
          </div>

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

        <nav aria-label="Popular categories" className="md:justify-self-end">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
            Popular now
          </div>
          <ul className="mt-2 flex max-w-[36rem] flex-wrap gap-2">
            {topCats.map((name) => (
              <li key={name}>
                <Link
                  href={categoryHref(name)}
                  prefetch
                  onClick={() =>
                    track("hero_category_click", { category: name })
                  }
                  className="chip-outline"
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
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M12 3l7 3v6a9 9 0 0 1-7 8 9 9 0 0 1-7-8V6l7-3z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M9 12l2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}
function StarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      {...props}
    >
      <path d="M12 17.27l5.18 3.05-1.4-6.03 4.64-4.02-6.12-.53L12 4 9.7 9.74l-6.12.53 4.64 4.02-1.4 6.03L12 17.27z" />
    </svg>
  );
}
function BoltIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      {...props}
    >
      <path d="M13 2 3 14h7l-1 8 11-14h-7V2z" />
    </svg>
  );
}
