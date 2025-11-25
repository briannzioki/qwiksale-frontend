// src/app/post/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Post a Listing · QwikSale",
  description:
    "Choose whether to post a product or a service listing on QwikSale.",
};

export default function PostLandingPage() {
  return (
    <div className="container-page py-10">
      {/* HERO */}
      <section className="mx-auto max-w-4xl text-center">
        <div className="rounded-2xl p-8 md:p-10 text-white bg-gradient-to-br from-brandNavy via-brandGreen to-brandBlue shadow-soft dark:shadow-none">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Create a listing in minutes
          </h1>
          <p className="mt-3 text-white/90 text-pretty">
            Products or services — beautiful posts that buyers trust. Add photos,
            set a price, and go.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/sell/product"
              className="btn-gradient-primary"
              aria-label="Post a product"
            >
              Post a product
            </Link>
            <Link
              href="/sell/service"
              className="btn-outline"
              aria-label="Post a service"
            >
              Post a service
            </Link>
          </div>

          {/* Trust chips */}
          <div className="mt-5 grid grid-cols-1 gap-2 text-xs text-white/90 sm:grid-cols-3">
            <div className="rounded-lg bg-white/10 px-3 py-2">Free to post</div>
            <div className="rounded-lg bg-white/10 px-3 py-2">
              No commissions
            </div>
            <div className="rounded-lg bg-white/10 px-3 py-2">
              Direct WhatsApp &amp; Calls
            </div>
          </div>
        </div>
      </section>

      {/* CHOOSER: Two-panel with gradient CTAs + icon bullets */}
      <section className="mx-auto mt-8 grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-2">
        {/* Product */}
        <article className="card flex flex-col justify-between p-6 md:p-7">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brandBlue/10 text-brandBlue">
                📦
              </span>
              <h2 className="text-xl font-semibold">Sell a Product</h2>
            </div>
            <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
              Phones, electronics, fashion, furniture, autos — anything legit.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-700 dark:text-slate-200">
              <li className="flex items-start gap-2">
                <span aria-hidden>🖼️</span>
                <span>Add up to 6 photos with instant previews</span>
              </li>
              <li className="flex items-start gap-2">
                <span aria-hidden>💸</span>
                <span>
                  Set a price or choose <em>Contact for price</em>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span aria-hidden>⚡</span>
                <span>WhatsApp-ready contact formatting</span>
              </li>
            </ul>
          </div>
          <div className="mt-6">
            <Link
              href="/sell/product"
              className="relative block w-full rounded-xl bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue px-4 py-2.5 text-center text-sm font-semibold text-white shadow transition hover:opacity-95"
              aria-label="Start a product listing"
            >
              Start product listing
            </Link>
          </div>
        </article>

        {/* Service */}
        <article className="card flex flex-col justify-between p-6 md:p-7">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brandGreen/10 text-brandGreen">
                🧰
              </span>
              <h2 className="text-xl font-semibold">Offer a Service</h2>
            </div>
            <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
              Cleaning, repairs, beauty, events, transport, tech — get discovered.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-700 dark:text-slate-200">
              <li className="flex items-start gap-2">
                <span aria-hidden>⏱️</span>
                <span>Fixed price or hourly/day rates</span>
              </li>
              <li className="flex items-start gap-2">
                <span aria-hidden>📍</span>
                <span>Service areas &amp; availability windows</span>
              </li>
              <li className="flex items-start gap-2">
                <span aria-hidden>💬</span>
                <span>
                  Direct enquiries; keep chats on WhatsApp if you prefer
                </span>
              </li>
            </ul>
          </div>
          <div className="mt-6">
            <Link
              href="/sell/service"
              className="btn-outline block w-full text-center"
              aria-label="Start a service listing"
            >
              Start service listing
            </Link>
          </div>
        </article>
      </section>

      {/* Compare strip */}
      <section className="mx-auto mt-6 max-w-5xl">
        <div className="rounded-2xl border border-gray-200/80 bg-white/90 p-4 text-sm shadow-sm shadow-slate-900/5 dark:border-white/10 dark:bg-slate-950/80">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-black/[0.03] p-3 dark:bg-white/[0.04]">
              <p className="font-semibold">Best for Products</p>
              <p className="text-gray-600 dark:text-slate-300">
                Tangible items with photos, condition, brand and price.
              </p>
            </div>
            <div className="rounded-lg bg-black/[0.03] p-3 dark:bg-white/[0.04]">
              <p className="font-semibold">Best for Services</p>
              <p className="text-gray-600 dark:text-slate-300">
                Skills or labor where you set a rate and coverage area.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto mt-10 max-w-5xl">
        <div className="card p-6 md:p-7">
          <h3 className="text-lg font-semibold">How it works</h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200/80 bg-white/90 p-4 dark:border-white/10 dark:bg-slate-950/80">
              <div className="text-2xl" aria-hidden>
                1
              </div>
              <p className="mt-2 text-sm text-gray-700 dark:text-slate-200">
                Create a listing with clear photos and details.
              </p>
            </div>
            <div className="rounded-xl border border-gray-200/80 bg-white/90 p-4 dark:border-white/10 dark:bg-slate-950/80">
              <div className="text-2xl" aria-hidden>
                2
              </div>
              <p className="mt-2 text-sm text-gray-700 dark:text-slate-200">
                Buyers contact you directly via call or WhatsApp.
              </p>
            </div>
            <div className="rounded-xl border border-gray-200/80 bg-white/90 p-4 dark:border-white/10 dark:bg-slate-950/80">
              <div className="text-2xl" aria-hidden>
                3
              </div>
              <p className="mt-2 text-sm text-gray-700 dark:text-slate-200">
                Meet safely, close the deal, and get paid.
              </p>
            </div>
          </div>

          <p className="mt-4 text-xs text-gray-500 dark:text-slate-400">
            New to selling? See tips and safety guidelines in{" "}
            <Link href="/help" className="underline underline-offset-2">
              Help
            </Link>
            .
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto mt-8 max-w-5xl">
        <div className="card p-6 md:p-7">
          <h3 className="text-lg font-semibold">Common questions</h3>
          <div className="mt-4 space-y-3">
            <details className="group rounded-lg border border-gray-200/80 bg-white/90 p-4 dark:border-white/10 dark:bg-slate-950/80">
              <summary className="cursor-pointer font-medium">
                Do I pay to post?
              </summary>
              <p className="mt-2 text-sm text-gray-700 dark:text-slate-200">
                Posting is free. We may add optional boosts later for extra
                visibility.
              </p>
            </details>
            <details className="group rounded-lg border border-gray-200/80 bg-white/90 p-4 dark:border-white/10 dark:bg-slate-950/80">
              <summary className="cursor-pointer font-medium">
                How do buyers contact me?
              </summary>
              <p className="mt-2 text-sm text-gray-700 dark:text-slate-200">
                Through the number you provide (calls/WhatsApp). You can keep
                chats in-app if you prefer.
              </p>
            </details>
            <details className="group rounded-lg border border-gray-200/80 bg-white/90 p-4 dark:border-white/10 dark:bg-slate-950/80">
              <summary className="cursor-pointer font-medium">
                Any safety tips?
              </summary>
              <p className="mt-2 text-sm text-gray-700 dark:text-slate-200">
                Meet in public places, verify payments (M-Pesa SMS vs app), and
                don’t share sensitive info.
              </p>
            </details>
          </div>
        </div>
      </section>

      {/* Secondary CTAs */}
      <section className="mx-auto mt-8 max-w-4xl text-center">
        <div className="card p-6 md:p-7">
          <p className="text-sm text-gray-700 dark:text-slate-200">
            Ready? Choose what you want to post:
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/sell/product"
              className="btn-gradient-primary"
              aria-label="Post a product"
            >
              Post a product
            </Link>
            <Link
              href="/sell/service"
              className="btn-outline"
              aria-label="Post a service"
            >
              Post a service
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
