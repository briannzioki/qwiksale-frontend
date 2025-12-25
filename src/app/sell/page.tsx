// src/app/sell/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";

export const metadata: Metadata = {
  title: "Sell on QwikSale",
  description: "Post products or services on QwikSale and reach buyers across Kenya.",
};

export default async function SellLandingPage() {
  const session = await auth().catch(() => null);
  const isAuthed = Boolean(session?.user);

  const productHref = isAuthed
    ? "/sell/product"
    : `/signin?callbackUrl=${encodeURIComponent("/sell/product")}`;

  const serviceHref = isAuthed
    ? "/sell/service"
    : `/signin?callbackUrl=${encodeURIComponent("/sell/service")}`;

  return (
    <div className="container-page py-6 text-[var(--text)] sm:py-10">
      {/* HERO */}
      <section className="mx-auto max-w-4xl text-center">
        <div className="rounded-2xl bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] text-white shadow-soft dark:shadow-none">
          <div className="container-page py-6 text-white sm:py-8">
            <h1 className="text-xl font-semibold leading-tight tracking-tight text-white sm:text-2xl md:text-3xl">
              Post a listing in minutes
            </h1>
            <p className="mt-1 text-[13px] text-white/80 sm:text-sm">
              Reach buyers directly. Add photos, price, and your contact - simple.
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5 sm:mt-6 sm:gap-3">
              {isAuthed ? (
                <>
                  <Link
                    prefetch={false}
                    href={productHref}
                    className="btn-gradient-primary"
                    aria-label="Post a product"
                  >
                    Post a product
                  </Link>
                  <Link
                    prefetch={false}
                    href={serviceHref}
                    className="btn-gradient-primary"
                    aria-label="Post a service"
                  >
                    Post a service
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    prefetch={false}
                    href={`/signin?callbackUrl=${encodeURIComponent("/sell")}`}
                    className="btn-gradient-primary"
                    aria-label="Sign in"
                  >
                    Sign in
                  </Link>
                  <Link
                    prefetch={false}
                    href="/signup"
                    className="btn-outline"
                    aria-label="Create an account"
                  >
                    Create an account
                  </Link>
                </>
              )}
            </div>

            <div
              className={[
                "mt-4 flex items-stretch justify-center gap-2 overflow-x-auto pb-1",
                "text-[11px] text-white/90 [-webkit-overflow-scrolling:touch]",
                "sm:mt-5 sm:grid sm:grid-cols-3 sm:gap-2 sm:overflow-visible sm:pb-0 sm:text-xs",
              ].join(" ")}
            >
              <div className="shrink-0 whitespace-nowrap rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/20 px-3 py-1.5 shadow-sm backdrop-blur-sm sm:whitespace-normal sm:py-2">
                Free to post
              </div>
              <div className="shrink-0 whitespace-nowrap rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/20 px-3 py-1.5 shadow-sm backdrop-blur-sm sm:whitespace-normal sm:py-2">
                No commission
              </div>
              <div className="shrink-0 whitespace-nowrap rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/20 px-3 py-1.5 shadow-sm backdrop-blur-sm sm:whitespace-normal sm:py-2">
                Direct WhatsApp / calls
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CHOOSER CARDS */}
      <section
        className={[
          "mx-auto mt-6 max-w-5xl",
          "flex gap-3 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]",
          "snap-x snap-mandatory",
          "md:grid md:grid-cols-2 md:gap-5 md:overflow-visible md:pb-0 md:snap-none",
          "sm:mt-8",
        ].join(" ")}
      >
        {/* Product card */}
        <div className="flex w-[88%] shrink-0 snap-start flex-col justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:max-w-sm sm:p-6 md:w-auto md:max-w-none md:shrink md:p-7 md:snap-none">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text)] sm:h-10 sm:w-10">
                📦
              </span>
              <h2 className="text-lg font-extrabold tracking-tight text-[var(--text)] sm:text-xl">
                Sell a Product
              </h2>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)] sm:text-sm">
              Phones, electronics, fashion, furniture, vehicles - anything legit.
            </p>
            <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-[var(--text-muted)] sm:mt-4 sm:space-y-2 sm:text-sm">
              <li>• Add up to 6 photos</li>
              <li>• Set price or &ldquo;Contact for price&rdquo;</li>
              <li>• Optional WhatsApp number for quick chats</li>
            </ul>
          </div>
          <div className="mt-4 sm:mt-6">
            <Link
              prefetch={false}
              href={productHref}
              className="btn-gradient-primary w-full"
              aria-label={isAuthed ? "Post a product" : "Sign in to start a product listing"}
            >
              {isAuthed ? "Start product listing" : "Sign in to post a product"}
            </Link>
          </div>
        </div>

        {/* Service card */}
        <div className="flex w-[88%] shrink-0 snap-start flex-col justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:max-w-sm sm:p-6 md:w-auto md:max-w-none md:shrink md:p-7 md:snap-none">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text)] sm:h-10 sm:w-10">
                🧰
              </span>
              <h2 className="text-lg font-extrabold tracking-tight text-[var(--text)] sm:text-xl">
                Offer a Service
              </h2>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)] sm:text-sm">
              Cleaning, repairs, beauty, events, transport, tech - list your service.
            </p>
            <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-[var(--text-muted)] sm:mt-4 sm:space-y-2 sm:text-sm">
              <li>• Fixed price or hourly/day rates</li>
              <li>• Service areas &amp; availability</li>
              <li>• Direct enquiries from buyers</li>
            </ul>
          </div>
          <div className="mt-4 sm:mt-6">
            <Link
              prefetch={false}
              href={serviceHref}
              className="btn-gradient-primary w-full"
              aria-label={isAuthed ? "Post a service" : "Sign in to start a service listing"}
            >
              {isAuthed ? "Start service listing" : "Sign in to post a service"}
            </Link>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto mt-8 max-w-5xl sm:mt-10">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-6 md:p-7">
          <h3 className="text-base font-extrabold tracking-tight text-[var(--text)] sm:text-lg">
            How it works
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:mt-4 sm:grid-cols-3 sm:gap-4">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-4">
              <div className="text-xl font-extrabold tracking-tight text-[var(--text)] sm:text-2xl">
                1
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-muted)] sm:mt-2 sm:text-sm">
                Create a clear listing with photos and details.
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-4">
              <div className="text-xl font-extrabold tracking-tight text-[var(--text)] sm:text-2xl">
                2
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-muted)] sm:mt-2 sm:text-sm">
                Interested buyers contact you directly via call, SMS, or WhatsApp.
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-4">
              <div className="text-xl font-extrabold tracking-tight text-[var(--text)] sm:text-2xl">
                3
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-muted)] sm:mt-2 sm:text-sm">
                Meet, verify, and close the deal. No commission fees.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="mx-auto mt-8 max-w-xl sm:mt-10">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 text-center shadow-soft sm:p-6 md:p-7">
          <h3 className="text-sm font-extrabold tracking-tight text-[var(--text)] sm:text-base">
            Ready? Choose what you want to post.
          </h3>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2.5 sm:mt-4 sm:gap-3">
            <Link
              prefetch={false}
              href={productHref}
              className="btn-gradient-primary"
              aria-label={isAuthed ? "Post a product" : "Sign in to post a product"}
            >
              Post a product
            </Link>
            <Link
              prefetch={false}
              href={serviceHref}
              className="btn-gradient-primary"
              aria-label={isAuthed ? "Post a service" : "Sign in to post a service"}
            >
              Post a service
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
