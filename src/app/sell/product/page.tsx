// src/app/sell/product/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import SellProductClient from "./SellProductClient";
import { getSessionUser } from "@/app/lib/authz";

type SP = Record<string, string | string[] | undefined>;

function firstParam(sp: SP, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const id = firstParam(sp, "id");
  const isEdit = Boolean(id && String(id).trim());

  let isAuthenticated = false;
  try {
    const viewer = await getSessionUser();
    if (viewer && viewer.id) {
      isAuthenticated = true;
    }
  } catch {
    // Soft page - do not let auth lookup failures 500 this route.
    isAuthenticated = false;
  }

  const signinHref = `/signin?callbackUrl=${encodeURIComponent("/sell/product")}`;
  const createHref = "/sell/product";

  const listingHref = isEdit && id ? `/product/${encodeURIComponent(id)}` : null;

  return (
    <main className="container-page py-4 text-[var(--text)] sm:py-6">
      <div className="mx-auto max-w-3xl space-y-3 sm:space-y-4">
        {/* Top nav helpers */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)] sm:text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard"
              prefetch={false}
              className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1.5 shadow-sm transition hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 ring-focus active:scale-[.99] sm:px-3 sm:py-1"
              data-testid="sell-product-back-dashboard"
            >
              ← Back to dashboard
            </Link>
            {listingHref && (
              <Link
                href={listingHref}
                prefetch={false}
                className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1.5 shadow-sm transition hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 ring-focus active:scale-[.99] sm:px-3 sm:py-1"
                data-testid="sell-product-view-listing"
              >
                View listing
              </Link>
            )}
          </div>
        </div>

        {/* Hero / context */}
        <div className="rounded-2xl bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] text-white shadow-soft dark:shadow-none">
          <div className="container-page py-6 text-white sm:py-8">
            <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl md:text-3xl">
              {isEdit ? "Edit Product" : "Sell a Product"}
            </h1>
            <p className="mt-1 text-[13px] text-white/80 sm:text-sm">
              Add clear photos, a fair price, and a strong description. You can
              edit or pause the listing any time from your dashboard.
            </p>
          </div>
        </div>

        {/* Guest warning - only for create flow (not while editing) */}
        {!isAuthenticated && !isEdit && (
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[13px] text-[var(--text-muted)] shadow-sm sm:px-4 sm:py-3 sm:text-sm">
            <p>
              <Link
                href={signinHref}
                className="font-semibold text-[var(--text)] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 ring-focus"
                prefetch={false}
              >
                Sign in
              </Link>{" "}
              to unlock the full sell flow (saved drafts, faster posting, and
              more trust on your profile).
            </p>
          </div>
        )}

        {/* Contextual CTAs only (edit mode) */}
        {isEdit && (
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <Link
              href={createHref}
              data-testid="sell-product-mode-cta"
              className="btn-outline inline-block"
              prefetch={false}
            >
              Create New
            </Link>

            {!isAuthenticated && (
              <Link
                href={signinHref}
                prefetch={false}
                className="text-[13px] font-semibold text-[var(--text)] underline underline-offset-2 transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 ring-focus sm:text-sm"
                data-e2e="sell-product-signin"
              >
                Sign in
              </Link>
            )}
          </div>
        )}

        <section
          aria-label={isEdit ? "Edit product form" : "Sell product form"}
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-4"
        >
          <SellProductClient id={id} isAuthenticated={isAuthenticated} />
        </section>
      </div>
    </main>
  );
}
