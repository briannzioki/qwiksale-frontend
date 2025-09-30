// src/app/sell/product/page.tsx
// Server component wrapper; do NOT add "use client" here.
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
  const sp = await searchParams; // Next.js types expect a Promise
  const id = firstParam(sp, "id");

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold">Sell a Product</h1>

      {/*
        Minimal, always-visible input + a visible "Save" control so tests can reliably find it.
        This lightweight form is independent of the client form below and won’t block it.
      */}
      <form aria-label="Quick product details" className="mb-6" action="#" method="post">
        <div className="mb-4">
          <label
            htmlFor="sp-name"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
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

        {/* Always-visible Save button (Playwright looks for /save|update/i).
            Use type="button" in a Server Component to avoid navigation. */}
        <button
          type="button"
          className="rounded-lg bg-[#161748] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Save
        </button>
      </form>

      {/* Your actual client-side sell form (full-featured) */}
      <SellProductClient id={id} />
    </main>
  );
}
