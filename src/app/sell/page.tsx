// src/app/sell/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";

/**
 * /sell — Sell landing page (chooser)
 * Lightweight client-only page. Sends users to:
 *  - /sell/product
 *  - /sell/service
 */
export default function SellLandingPage() {
  return (
    <div className="container-page py-8">
      <div className="mx-auto max-w-2xl space-y-6 text-center">
        {/* Hero */}
        <div className="rounded-2xl p-8 text-white bg-gradient-to-br from-brandNavy via-brandGreen to-brandBlue shadow-soft dark:shadow-none">
          <h1 className="text-3xl font-extrabold tracking-tight">Post a listing</h1>
          <p className="mt-2 text-white/90">
            QwikSale connects buyers and sellers directly. Choose what you want to post.
          </p>
        </div>

        {/* Actions */}
        <div className="card p-6 space-y-4">
          <p className="text-sm text-gray-700 dark:text-slate-200">
            What would you like to post?
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/sell/product" className="btn-outline" aria-label="Post a product">
              Post a product
            </Link>
            <Link href="/sell/service" className="btn-gradient-primary" aria-label="Post a service">
              Post a service
            </Link>
            <Link href="/" className="btn-outline" aria-label="Cancel">
              Cancel
            </Link>
          </div>

          <p className="text-xs text-gray-500 dark:text-slate-400">
            You can add photos, pricing, and contact details on the next step.
          </p>
        </div>
      </div>
    </div>
  );
}
