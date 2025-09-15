"use client";

import Link from "next/link";

/**
 * /sell — Sell landing page
 * Keep this lightweight and client-only (no search params, no data fetching).
 * Links out to specific flows like posting a service.
 */
export default function SellLandingPage() {
  return (
    <div className="container-page py-8">
      <div className="mx-auto max-w-2xl space-y-6 text-center">
        {/* Hero */}
        <div className="rounded-2xl p-8 text-white bg-gradient-to-br from-brandNavy via-brandGreen to-brandBlue shadow-soft dark:shadow-none">
          <h1 className="text-3xl font-extrabold tracking-tight">Sell on QwikSale</h1>
          <p className="mt-2 text-white/90">
            Post what you offer and start getting messages from interested buyers.
          </p>
        </div>

        {/* Actions */}
        <div className="card p-6 space-y-4">
          <p className="text-sm text-gray-700 dark:text-slate-200">
            Choose what you want to post:
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/sell/service" className="btn-gradient-primary">
              Post a service
            </Link>
            {/* If you later add a dedicated product flow, link it here */}
            {/* <Link href="/sell/product" className="btn-outline">Post a product</Link> */}
            <Link href="/" className="btn-outline">
              Cancel
            </Link>
          </div>

          <p className="text-xs text-gray-500 dark:text-slate-400">
            You can add photos, pricing, and contact details after you choose a flow.
          </p>
        </div>
      </div>
    </div>
  );
}
