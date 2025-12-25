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
    <main className="container-page bg-[var(--bg)] py-4 sm:py-6">
      {/* HERO */}
      <section className="mx-auto max-w-4xl text-center">
        <div className="rounded-2xl bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] text-white shadow-soft">
          <div className="container-page py-6 text-white sm:py-8">
            <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
              Create a listing in minutes
            </h1>
            <p className="mt-1 text-sm text-white/80">
              Products or services - beautiful posts that buyers trust. Add
              photos, set a price, and go.
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:mt-6 sm:gap-3">
              <Link
                href="/sell/product"
                prefetch={false}
                className="btn-gradient-primary text-xs sm:text-sm"
                aria-label="Post a product"
                data-testid="post-cta-product"
              >
                Post a product
              </Link>
              <Link
                href="/sell/service"
                prefetch={false}
                className="btn-outline text-xs sm:text-sm"
                aria-label="Post a service"
                data-testid="post-cta-service"
              >
                Post a service
              </Link>
            </div>

            {/* Trust chips */}
            <div className="mt-4 flex gap-2 overflow-x-auto [-webkit-overflow-scrolling:touch] sm:mt-5 sm:grid sm:grid-cols-3 sm:overflow-visible">
              <div className="shrink-0 whitespace-nowrap rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/20 px-3 py-1.5 text-xs text-white/90 shadow-sm backdrop-blur-sm sm:py-2">
                Free to post
              </div>
              <div className="shrink-0 whitespace-nowrap rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/20 px-3 py-1.5 text-xs text-white/90 shadow-sm backdrop-blur-sm sm:py-2">
                No commissions
              </div>
              <div className="shrink-0 whitespace-nowrap rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/20 px-3 py-1.5 text-xs text-white/90 shadow-sm backdrop-blur-sm sm:py-2">
                Direct WhatsApp &amp; Calls
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CHOOSER: Two-panel with CTAs + icon bullets */}
      <section className="mx-auto mt-6 grid max-w-5xl grid-cols-1 gap-4 sm:mt-8 sm:gap-5 md:grid-cols-2">
        {/* Product */}
        <article className="flex flex-col justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-6 md:p-7">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text)]">
                📦
              </span>
              <h2 className="text-lg font-extrabold tracking-tight text-[var(--text)] sm:text-xl">
                Sell a Product
              </h2>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)] sm:mt-2">
              Phones, electronics, fashion, furniture, autos - anything legit.
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--text)] sm:mt-4">
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
          <div className="mt-4 sm:mt-6">
            <Link
              href="/sell/product"
              prefetch={false}
              className="btn-gradient-primary block w-full text-center text-xs sm:text-sm"
              aria-label="Start a product listing"
            >
              Start product listing
            </Link>
          </div>
        </article>

        {/* Service */}
        <article className="flex flex-col justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-6 md:p-7">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text)]">
                🧰
              </span>
              <h2 className="text-lg font-extrabold tracking-tight text-[var(--text)] sm:text-xl">
                Offer a Service
              </h2>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)] sm:mt-2">
              Cleaning, repairs, beauty, events, transport, tech - get
              discovered.
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--text)] sm:mt-4">
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
          <div className="mt-4 sm:mt-6">
            <Link
              href="/sell/service"
              prefetch={false}
              className="btn-outline block w-full text-center text-xs sm:text-sm"
              aria-label="Start a service listing"
            >
              Start service listing
            </Link>
          </div>
        </article>
      </section>

      {/* Compare strip */}
      <section className="mx-auto mt-5 max-w-5xl sm:mt-6">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-sm shadow-soft sm:p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-2.5 sm:p-3">
              <p className="font-semibold text-[var(--text)]">
                Best for Products
              </p>
              <p className="mt-1 text-[var(--text-muted)]">
                Tangible items with photos, condition, brand and price.
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-2.5 sm:p-3">
              <p className="font-semibold text-[var(--text)]">
                Best for Services
              </p>
              <p className="mt-1 text-[var(--text-muted)]">
                Skills or labor where you set a rate and coverage area.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto mt-6 max-w-5xl sm:mt-10">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-6 md:p-7">
          <h3 className="text-lg font-extrabold tracking-tight text-[var(--text)]">
            How it works
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:mt-4 sm:grid-cols-3 sm:gap-4">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 sm:p-4">
              <div
                className="text-2xl font-extrabold tracking-tight text-[var(--text)]"
                aria-hidden
              >
                1
              </div>
              <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)] sm:mt-2">
                Create a listing with clear photos and details.
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 sm:p-4">
              <div
                className="text-2xl font-extrabold tracking-tight text-[var(--text)]"
                aria-hidden
              >
                2
              </div>
              <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)] sm:mt-2">
                Buyers contact you directly via call or WhatsApp.
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 sm:p-4">
              <div
                className="text-2xl font-extrabold tracking-tight text-[var(--text)]"
                aria-hidden
              >
                3
              </div>
              <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)] sm:mt-2">
                Meet safely, close the deal, and get paid.
              </p>
            </div>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)] sm:mt-4">
            New to selling? See tips and safety guidelines in{" "}
            <Link
              href="/help"
              prefetch={false}
              className="underline underline-offset-2"
            >
              Help
            </Link>
            .
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto mt-6 max-w-5xl sm:mt-8">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-6 md:p-7">
          <h3 className="text-lg font-extrabold tracking-tight text-[var(--text)]">
            Common questions
          </h3>
          <div className="mt-3 space-y-3 sm:mt-4">
            <details className="group rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 sm:p-4">
              <summary className="cursor-pointer font-medium text-[var(--text)]">
                Do I pay to post?
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                Posting is free. We may add optional boosts later for extra
                visibility.
              </p>
            </details>

            <details className="group rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 sm:p-4">
              <summary className="cursor-pointer font-medium text-[var(--text)]">
                How do buyers contact me?
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                Through the number you provide (calls/WhatsApp). You can keep
                chats in-app if you prefer.
              </p>
            </details>

            <details className="group rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 sm:p-4">
              <summary className="cursor-pointer font-medium text-[var(--text)]">
                Any safety tips?
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                Meet in public places, verify payments (M-Pesa SMS vs app), and
                don’t share sensitive info.
              </p>
            </details>
          </div>
        </div>
      </section>

      {/* Secondary CTAs */}
      <section className="mx-auto mt-6 max-w-4xl text-center sm:mt-8">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-6 md:p-7">
          <p className="text-sm leading-relaxed text-[var(--text-muted)]">
            Ready? Choose what you want to post:
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            <Link
              href="/sell/product"
              prefetch={false}
              className="btn-gradient-primary text-xs sm:text-sm"
              aria-label="Post a product"
            >
              Post a product
            </Link>
            <Link
              href="/sell/service"
              prefetch={false}
              className="btn-outline text-xs sm:text-sm"
              aria-label="Post a service"
            >
              Post a service
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
