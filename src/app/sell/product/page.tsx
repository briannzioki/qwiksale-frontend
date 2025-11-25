// src/app/sell/product/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    // Soft page – do not let auth lookup failures 500 this route.
    isAuthenticated = false;
  }

  return (
    <main className="container-page py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        {/* Hero / context */}
        <div className="rounded-2xl bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue p-6 text-white shadow-soft dark:shadow-none">
          <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">
            {isEdit ? "Edit Product" : "Sell a Product"}
          </h1>
          <p className="mt-2 text-sm text-white/90">
            Add clear photos, a fair price, and a strong description. You can edit
            or pause the listing any time from your dashboard.
          </p>
        </div>

        {/* Guest warning */}
        {!isAuthenticated && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
            <p>
              <a
                href={`/signin?callbackUrl=${encodeURIComponent("/sell/product")}`}
                className="font-semibold underline"
              >
                Sign in
              </a>{" "}
              to unlock the full sell flow (saved drafts, faster posting, and more
              trust on your profile).
            </p>
          </div>
        )}

        {/* Server-side CTA that Playwright can assert without JS. */}
        <div>
          <button
            type="button"
            data-testid="sell-product-mode-cta"
            className="btn-outline"
          >
            {isEdit ? "Save changes" : "Post product"}
          </button>
        </div>

        {/* Real implementation (create/edit) lives in SellProductClient */}
        <section
          aria-label={isEdit ? "Edit product form" : "Sell product form"}
          className="rounded-2xl border border-border bg-card/90 p-4 shadow-sm"
        >
          <SellProductClient id={id} isAuthenticated={isAuthenticated} />
        </section>
      </div>
    </main>
  );
}
