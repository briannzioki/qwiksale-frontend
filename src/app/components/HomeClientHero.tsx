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
const categoryHref = (value: string) => `/?category=${encodeURIComponent(value)}`;

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

  const menuPanelClass = [
    "absolute left-0 top-[calc(100%+8px)] z-30 w-[min(360px,92vw)]",
    "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft",
  ].join(" ");

  return (
    <section
      aria-label="Welcome hero"
      className={[
        "relative overflow-hidden rounded-2xl border border-[var(--border-subtle)]",
        "bg-[var(--bg-elevated)]",
        "p-4 sm:p-5 md:p-6",
        "shadow-soft",
        className,
      ].join(" ")}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[var(--bg-elevated)] opacity-[0.65] dark:opacity-[0.75]"
      />

      <div className="relative z-10 grid gap-3 sm:gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <h1
            className="mt-0.5 text-balance text-lg font-extrabold tracking-tight text-[var(--text-strong)] sm:text-xl"
            aria-live="polite"
          >
            {greeting} - buy &amp; sell, faster.
          </h1>

          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--text-muted)] sm:text-sm">
            Browse fresh deals across Kenya. Post your own listing in seconds and reach local
            buyers.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-1.5 sm:gap-2">
            <Link
              href="/sell"
              prefetch
              onClick={() => track("hero_sell_click")}
              className="btn-gradient-hero px-3 py-2 text-sm sm:px-4 sm:py-2"
            >
              + Post a listing
            </Link>

            <Link
              href="/search"
              prefetch
              onClick={() => track("hero_browse_click")}
              className="btn-outline px-3 py-2 text-sm sm:px-4 sm:py-2"
            >
              Browse all
            </Link>

            {isAppAuthed ? (
              <>
                <details className="group relative hidden sm:block">
                  <summary
                    className={[
                      "btn-outline px-3 py-2 text-sm sm:px-4 sm:py-2",
                      "cursor-pointer list-none",
                      "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                    ].join(" ")}
                    aria-label="Open account actions"
                  >
                    More
                  </summary>

                  <div className={menuPanelClass} role="dialog" aria-label="Account actions">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Account actions
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <Link
                        href="/saved"
                        prefetch
                        onClick={() => track("hero_saved_click")}
                        aria-label="Favorites"
                        className="btn-outline"
                      >
                        Favorites
                      </Link>

                      <Link
                        href="/dashboard"
                        prefetch
                        onClick={() => track("hero_dashboard_click")}
                        aria-label="Dashboard"
                        className="btn-outline"
                      >
                        Dashboard
                      </Link>

                      {!user?.username && (
                        <Link
                          href="/account/complete-profile"
                          prefetch
                          onClick={() => track("hero_complete_profile_click")}
                          className="btn-outline"
                          aria-label="Complete profile"
                          title="Set your username and profile details"
                        >
                          Complete profile
                        </Link>
                      )}
                    </div>

                    <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
                      Kept compact here to maximize the feed area.
                    </p>
                  </div>
                </details>

                <Link
                  href="/dashboard"
                  prefetch
                  onClick={() => track("hero_dashboard_click")}
                  className="hidden"
                  aria-hidden="true"
                  tabIndex={-1}
                >
                  <IconButton icon="settings" variant="outline" labelText="Dashboard" srLabel="Dashboard" />
                </Link>
              </>
            ) : (
              <>
                <Link
                  href={signInHref}
                  prefetch
                  aria-label="Sign in to QwikSale"
                  onClick={() => track("hero_signin_click")}
                  className="btn-outline px-3 py-2 text-sm sm:px-4 sm:py-2"
                >
                  Sign in to QwikSale
                </Link>
                <Link
                  href="/signup"
                  prefetch
                  onClick={() => track("hero_join_click")}
                  className="btn-outline px-3 py-2 text-sm sm:px-4 sm:py-2"
                >
                  Join
                </Link>
              </>
            )}
          </div>

          <ul className="mt-3 hidden flex-wrap items-center gap-3 text-xs text-[var(--text-muted)] sm:flex">
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
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] sm:text-xs">
            Popular now
          </div>

          <ul
            className={[
              "mt-2 flex gap-2",
              "flex-nowrap overflow-x-auto overscroll-x-contain",
              "pb-1 pr-1 [-webkit-overflow-scrolling:touch]",
              "md:max-w-[36rem] md:flex-wrap md:overflow-visible md:pb-0 md:pr-0",
            ].join(" ")}
          >
            {topCats.map((name) => (
              <li key={name} className="shrink-0">
                <Link
                  href={categoryHref(name)}
                  prefetch
                  onClick={() => track("hero_category_click", { category: name })}
                  className="chip-outline whitespace-nowrap"
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
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" />
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
