// src/app/sell/service/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import SellServiceClient from "./SellServiceClient";
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

  const signinHref = `/signin?callbackUrl=${encodeURIComponent("/sell/service")}`;
  const createHref = "/sell/service";

  const listingHref = isEdit && id ? `/service/${encodeURIComponent(id)}` : null;

  return (
    <main className="container-page py-6 text-[var(--text)]">
      <div className="mx-auto max-w-3xl space-y-4">
        {/* Top nav helpers */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard"
              prefetch={false}
              className={[
                "inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5",
                "border border-[var(--border-subtle)] bg-[var(--bg-subtle)]",
                "text-[var(--text-muted)] shadow-sm transition",
                "hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]",
                "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                "active:scale-[.99]",
              ].join(" ")}
              data-testid="sell-service-back-dashboard"
            >
              ← Back to dashboard
            </Link>
            {listingHref && (
              <Link
                href={listingHref}
                prefetch={false}
                className={[
                  "inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5",
                  "border border-[var(--border-subtle)] bg-[var(--bg-subtle)]",
                  "text-[var(--text-muted)] shadow-sm transition",
                  "hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]",
                  "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                  "active:scale-[.99]",
                ].join(" ")}
                data-testid="sell-service-view-listing"
              >
                View listing
              </Link>
            )}
          </div>
        </div>

        {/* Hero / context */}
        <div className="rounded-2xl bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] text-white shadow-soft dark:shadow-none">
          <div className="container-page py-8 text-white">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl text-white">
              {isEdit ? "Edit Service" : "Sell a Service"}
            </h1>
            <p className="mt-1 text-sm text-white/80">
              Describe what you do, where you operate, and how people can reach
              you. You can tweak or pause the service any time.
            </p>
          </div>
        </div>

        {/* Guest warning - only for create flow (not while editing) */}
        {!isAuthenticated && !isEdit && (
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-3 text-sm text-[var(--text)] shadow-sm">
            <p className="leading-relaxed text-[var(--text-muted)]">
              <Link
                href={signinHref}
                className="font-semibold text-[var(--text)] underline underline-offset-4"
                prefetch={false}
              >
                Sign in
              </Link>{" "}
              to unlock the full sell flow for your services.
            </p>
          </div>
        )}

        {/* Contextual CTAs only (edit mode) */}
        {isEdit && (
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={createHref}
              data-testid="sell-service-mode-cta"
              className="btn-outline inline-block"
              prefetch={false}
            >
              Create New
            </Link>

            {!isAuthenticated && (
              <Link
                href={signinHref}
                prefetch={false}
                className={[
                  "text-sm font-semibold",
                  "text-[var(--text)] underline-offset-4",
                  "hover:underline",
                  "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                  "rounded-md",
                ].join(" ")}
                data-e2e="sell-service-signin"
              >
                Sign in
              </Link>
            )}
          </div>
        )}

        {/* Real implementation (create/edit) lives in SellServiceClient.
            Client code is responsible for:
            - POSTing to the API
            - Redirecting to /dashboard on successful create/edit
            - Showing any “View listing” actions in success UI */}
        <section
          aria-label={isEdit ? "Edit service form" : "Sell service form"}
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft"
        >
          <SellServiceClient editId={id} isAuthenticated={isAuthenticated} />
        </section>
      </div>
    </main>
  );
}
