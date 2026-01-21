// src/app/marketplace/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import Link from "next/link";
import SectionHeader from "@/app/components/SectionHeader";

export const metadata: Metadata = {
  title: "Marketplace · QwikSale",
  description:
    "Explore QwikSale’s marketplace: products and services. Browse, search, post, and connect with sellers and service providers.",
  alternates: { canonical: "/marketplace" },
};

const SectionHeaderAny = SectionHeader as any;

const btn =
  "inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 " +
  "text-xs font-semibold text-[var(--text)] shadow-sm transition hover:bg-[var(--bg-subtle)] " +
  "focus-visible:outline-none focus-visible:ring-2 ring-focus active:scale-[.99] sm:text-sm";

const card =
  "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-5";

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
      {children}
    </p>
  );
}

export default function MarketplacePage() {
  return (
    <main id="main" className="container-page py-4 text-[var(--text)] sm:py-6" aria-label="Marketplace">
      <header className={card}>
        <SectionHeaderAny
          title="Marketplace"
          subtitle="Products and services live together. Browse what’s available or post a request when you can’t find it yet."
          kicker="Browse"
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/search" prefetch={false} className={btn}>
            Browse all
          </Link>
          <Link href="/requests" prefetch={false} className={btn}>
            Browse requests
          </Link>
          <Link href="/how-it-works" prefetch={false} className={btn}>
            How it works
          </Link>
          <Link href="/trust" prefetch={false} className={btn}>
            Trust & safety
          </Link>
        </div>
      </header>

      <section className="mt-6 grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2" aria-label="Products and services">
        <div className={card}>
          <Kicker>Products</Kicker>
          <h2 className="mt-1 text-lg font-extrabold tracking-tight text-[var(--text)] sm:text-xl">
            Buy and sell items
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            Phones, electronics, home items, fashion, and more. Save favorites, chat with sellers, and arrange delivery when needed.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/search" prefetch={false} className={btn}>
              Browse products
            </Link>
            <Link href="/sell/product" prefetch={false} className={btn}>
              Post a product
            </Link>
          </div>
        </div>

        <div className={card}>
          <Kicker>Services</Kicker>
          <h2 className="mt-1 text-lg font-extrabold tracking-tight text-[var(--text)] sm:text-xl">
            Find help or offer a service
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            From repairs to creative work. Compare providers, message directly, and leave reviews after the job is done.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/search" prefetch={false} className={btn}>
              Browse services
            </Link>
            <Link href="/sell/service" prefetch={false} className={btn}>
              Post a service
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3" aria-label="If you can’t find it">
        <div className={card}>
          <Kicker>Requests</Kicker>
          <h3 className="mt-1 text-base font-extrabold tracking-tight text-[var(--text)]">
            Post what you need
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            Requests help the marketplace work even when listings are missing. Sellers and providers can respond fast.
          </p>
          <div className="mt-3">
            <Link href="/requests/new" prefetch={false} className={btn}>
              Post a request
            </Link>
          </div>
        </div>

        <div className={card}>
          <Kicker>Delivery</Kicker>
          <h3 className="mt-1 text-base font-extrabold tracking-tight text-[var(--text)]">
            Get it delivered
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            Use carriers near you or near a store area. Choose based on trust signals and recent activity.
          </p>
          <div className="mt-3">
            <Link href="/delivery" prefetch={false} className={btn}>
              Find carriers
            </Link>
          </div>
        </div>

        <div className={card}>
          <Kicker>Earn</Kicker>
          <h3 className="mt-1 text-base font-extrabold tracking-tight text-[var(--text)]">
            Become a carrier
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            Onboard once, then go online to accept delivery requests. Carrier profiles belong to your user account.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/carrier/onboarding" prefetch={false} className={btn}>
              Start onboarding
            </Link>
            <Link href="/carrier" prefetch={false} className={btn}>
              Carrier dashboard
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-5" aria-label="Marketplace CTA">
        <h2 className="text-base font-extrabold tracking-tight text-[var(--text)] sm:text-lg">
          Start in 60 seconds
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Create an account, post your first listing or request, and connect.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/signup" prefetch={false} className={btn}>
            Create account
          </Link>
          <Link href="/sell" prefetch={false} className={btn}>
            Post a listing
          </Link>
          <Link href="/requests/new" prefetch={false} className={btn}>
            Post a request
          </Link>
        </div>
      </section>
    </main>
  );
}
