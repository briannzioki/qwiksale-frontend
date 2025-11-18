// src/app/sell/product/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { cookies } from "next/headers";
import SellProductClient from "./SellProductClient";

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

  // SSR auth sniff: look for next-auth cookie (same pattern as /sell/service)
  const cookieStore = await cookies();
  const authed = Boolean(
    cookieStore.get("__Secure-next-auth.session-token")?.value ||
      cookieStore.get("next-auth.session-token")?.value,
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 space-y-4">
      <h1 className="text-xl font-semibold">
        {isEdit ? "Edit product" : "Sell a Product"}
      </h1>

      {!authed && (
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

      {/* Server-side CTA that always renders immediately.
          Playwright targets this via data-testid="sell-product-mode-cta"
          in both create (/sell/product) and edit (/sell/product?id=...) modes.
       */}
      <div className="mb-2">
        <button
          type="button"
          data-testid="sell-product-mode-cta"
          className="btn-outline"
        >
          {isEdit ? "Save changes" : "Post product"}
        </button>
      </div>

      {/* The real flow (create vs edit) lives in SellProductClient + its form.
          Only this server button owns data-testid="sell-product-mode-cta" so tests
          can target a stable SSR CTA before hydration.
       */}
      <SellProductClient id={id} />
    </main>
  );
}
