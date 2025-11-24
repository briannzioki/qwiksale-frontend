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
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold">
        {isEdit ? "Edit Product" : "Sell a Product"}
      </h1>

      {!isAuthenticated && (
        <p className="mb-4 text-sm text-gray-700 dark:text-slate-200">
          <a
            href={`/signin?callbackUrl=${encodeURIComponent("/sell/product")}`}
            className="btn-outline"
          >
            Sign in
          </a>{" "}
          to unlock the full sell flow.
        </p>
      )}

      {/* Server-side CTA that Playwright can assert without JS. */}
      <div className="mb-4">
        <button
          type="button"
          data-testid="sell-product-mode-cta"
          className="btn-outline"
        >
          {isEdit ? "Save changes" : "Post product"}
        </button>
      </div>

      {/* Real implementation (create/edit) lives in SellProductClient */}
      <SellProductClient id={id} isAuthenticated={isAuthenticated} />
    </main>
  );
}
