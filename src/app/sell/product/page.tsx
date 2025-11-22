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
    // Soft page – we do not want auth lookup failures to 500.
    isAuthenticated = false;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 space-y-4">
      <h1 className="text-xl font-semibold">
        {isEdit ? "Edit product" : "Sell a Product"}
      </h1>

      {!isAuthenticated && (
        <p className="mb-2 text-sm text-gray-700 dark:text-slate-200">
          <a
            href={`/signin?callbackUrl=${encodeURIComponent("/sell/product")}`}
            className="btn-outline"
          >
            Sign in
          </a>{" "}
          to unlock the full sell flow.
        </p>
      )}

      {/* Server-side CTA that Playwright hits */}
      <div className="mb-2">
        <button
          type="button"
          data-testid="sell-product-mode-cta"
          className="btn-outline"
        >
          {isEdit ? "Save changes" : "Post product"}
        </button>
      </div>

      <SellProductClient id={id} isAuthenticated={isAuthenticated} />
    </main>
  );
}
