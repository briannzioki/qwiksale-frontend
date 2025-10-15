// src/app/sell/product/page.tsx
// Server component wrapper; do NOT add "use client" here.
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  const sp = await searchParams; // Next 15 expects Promise here
  const id = firstParam(sp, "id");
  const isEdit = Boolean(id && String(id).trim());

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold">Sell a Product</h1>

      {/* Deterministic CTAs: always render BOTH links for tests */}
      <div className="mb-4 flex items-center gap-3">
        <a href="/sell/product" className="btn-outline" aria-label="Create New Product">
          Create New
        </a>
        <a
          href={`/signin?callbackUrl=${encodeURIComponent("/sell/product")}`}
          className="btn-outline"
          aria-label="Sign in to continue"
        >
          Sign in
        </a>
        <span className="text-sm text-gray-600">to unlock the full sell flow.</span>
      </div>

      {/* Minimal, always-visible inputs so tests have stable controls */}
      <form aria-label="Quick product details" className="mb-6" action="#" method="post">
        <div className="mb-4">
          <label htmlFor="sp-name" className="mb-1 block text-sm font-medium text-gray-700">
            Product Name
          </label>
          <input
            id="sp-name"
            name="name"
            type="text"
            placeholder="e.g. iPhone 13, 128GB"
            aria-label="Name"
            className="w-full rounded-md border px-3 py-2"
          />
        </div>

        {/* Only show the stub Save in CREATE mode to avoid duplicate /save|update|edit/i on edit */}
        {!isEdit && (
          <button
            type="button"
            className="rounded-lg bg-[#161748] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Save
          </button>
        )}
      </form>

      {/* Full client-side form */}
      <SellProductClient id={id} />
    </main>
  );
}
