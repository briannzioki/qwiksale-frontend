// src/app/how-it-works/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import Link from "next/link";
import SectionHeader from "@/app/components/SectionHeader";

export const metadata: Metadata = {
  title: "How it works · QwikSale",
  description:
    "Understand how QwikSale works end-to-end: accounts, marketplace listings, requests, delivery/carriers, trust and admin moderation, and optional upgrades.",
  alternates: { canonical: "/how-it-works" },
};

const SectionHeaderAny = SectionHeader as any;

const heroBtn =
  "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition " +
  "focus-visible:outline-none focus-visible:ring-2 ring-focus active:scale-[.99] " +
  "border-white/20 bg-white/10 text-white hover:bg-white/15 sm:text-sm";

const btn =
  "inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 " +
  "text-xs font-semibold text-[var(--text)] shadow-sm transition hover:bg-[var(--bg-subtle)] " +
  "focus-visible:outline-none focus-visible:ring-2 ring-focus active:scale-[.99] sm:text-sm";

const chip =
  "inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] " +
  "px-2.5 py-1 text-[11px] font-semibold text-[var(--text)] shadow-sm";

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-5">
      <div className="flex items-start gap-3">
        <div
          className={[
            "grid h-9 w-9 shrink-0 place-content-center rounded-xl border",
            "border-[var(--border-subtle)] bg-[var(--bg-subtle)]",
            "text-sm font-extrabold text-[var(--text)]",
          ].join(" ")}
          aria-hidden="true"
        >
          {n}
        </div>
        <div className="min-w-0">
          <div className="text-base font-extrabold tracking-tight text-[var(--text)]">{title}</div>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">{body}</p>
        </div>
      </div>
    </div>
  );
}

export default function HowItWorksPage() {
  // IMPORTANT for Playwright pages-wiring:
  // It checks visibility for a[href="/search"] OR "/requests" OR "/delivery" OR "/carrier" OR "/carrier/onboarding".
  // Keep exactly ONE of those as an exact href, and make the others query variants to avoid strict-mode collisions.
  const HREF_REQUESTS = "/requests?src=how-it-works";
  const HREF_DELIVERY = "/delivery?src=how-it-works";
  const HREF_CARRIER = "/carrier?src=how-it-works";
  const HREF_CARRIER_ONBOARDING = "/carrier/onboarding?src=how-it-works";

  return (
    <main id="main" className="container-page py-4 text-[var(--text)] sm:py-6" aria-label="How QwikSale works">
      <header
        className={[
          "relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] shadow-soft",
          "bg-gradient-to-r from-[var(--brand-navy)] via-[var(--brand-green)] to-[var(--brand-blue)]",
          "p-4 text-white sm:p-6",
        ].join(" ")}
      >
        <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />

        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">How it works</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">How it works</h1>
          <p className="mt-2 max-w-3xl text-sm text-white/90 sm:text-base">
            Accounts → Marketplace (Products/Services) → Requests (Jobs) → Delivery/Carriers → Trust/Admin moderation →
            Payments (optional upgrades).
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {/* ✅ Keep one canonical exact href */}
            <Link href="/search" prefetch={false} className={heroBtn} aria-label="Browse listings" title="Browse listings">
              Browse listings
            </Link>

            <Link href={HREF_REQUESTS} prefetch={false} className={heroBtn} aria-label="Browse requests" title="Browse requests">
              Browse requests
            </Link>

            <Link href={HREF_DELIVERY} prefetch={false} className={heroBtn} aria-label="Delivery" title="Delivery">
              Delivery
            </Link>

            <Link href={HREF_CARRIER} prefetch={false} className={heroBtn} aria-label="Carrier" title="Carrier">
              Carrier
            </Link>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={chip}>Verified profiles</span>
            <span className={chip}>Requests & gigs</span>
            <span className={chip}>Carrier delivery</span>
            <span className={chip}>Admin moderation</span>
          </div>
        </div>
      </header>

      <section className="mt-6 space-y-3 sm:space-y-4" aria-label="Ecosystem overview">
        <SectionHeaderAny
          title="The journey in 6 steps"
          subtitle="This is the simplest way to understand how QwikSale connects everyone."
          kicker="Overview"
        />

        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
          <Step
            n="01"
            title="Create an account"
            body="Sign up with email/password or Google. Complete your profile with a username, phone, and location so buyers and sellers can coordinate safely."
          />
          <Step
            n="02"
            title="Browse products and services"
            body="Sellers post Products (items) and Services (jobs they offer). Buyers browse, search, save favorites, and contact providers."
          />
          <Step
            n="03"
            title="Post or respond to requests"
            body="Requests let buyers ask for what they need even if they don’t see it listed yet. Sellers/providers can respond or contact the requester."
          />
          <Step
            n="04"
            title="Deliver with carriers"
            body="Delivery is powered by carrier profiles (owned by users). Buyers can request delivery and carriers accept/complete jobs when they’re online."
          />
          <Step
            n="05"
            title="Build trust"
            body="Verification signals, reviews, reports, and safety guidance make it easier to choose who to transact with and how to meet safely."
          />
          <Step
            n="06"
            title="Optional upgrades"
            body="QwikSale can support paid tiers for visibility and platform tools (e.g., featured tiers). Buyer-to-seller payments can remain flexible depending on the listing."
          />
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="Roles">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft">
          <div className="text-sm font-extrabold tracking-tight text-[var(--text)]">For buyers</div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
            Browse listings, post a request, contact sellers, and request delivery when needed.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/search" prefetch={false} className={btn}>
              Browse
            </Link>
            <Link href="/requests/new" prefetch={false} className={btn}>
              Post a request
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft">
          <div className="text-sm font-extrabold tracking-tight text-[var(--text)]">For sellers</div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
            Post products/services, respond to requests, and build reputation through reviews and verified signals.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/sell" prefetch={false} className={btn}>
              Post a listing
            </Link>
            <Link href="/dashboard" prefetch={false} className={btn}>
              Dashboard
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft">
          <div className="text-sm font-extrabold tracking-tight text-[var(--text)]">For carriers</div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
            Onboard once, go online, receive delivery requests, and complete trips with clear enforcement rules.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={HREF_CARRIER_ONBOARDING} prefetch={false} className={btn}>
              Become a carrier
            </Link>
            <Link href={HREF_CARRIER} prefetch={false} className={btn}>
              Carrier dashboard
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft">
          <div className="text-sm font-extrabold tracking-tight text-[var(--text)]">For admins</div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
            Moderate listings/requests, enforce suspensions/bans, and review metrics that keep the platform healthy.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/admin" prefetch={false} className={btn}>
              Admin dashboard
            </Link>
            <Link href="/trust" prefetch={false} className={btn}>
              Trust page
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-5" aria-label="Next steps">
        <h2 className="text-base font-extrabold tracking-tight text-[var(--text)] sm:text-lg">Ready to start?</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Pick a path based on what you want to do today.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/search" prefetch={false} className={btn}>
            Browse marketplace
          </Link>
          <Link href={HREF_REQUESTS} prefetch={false} className={btn}>
            Browse requests
          </Link>
          <Link href={HREF_DELIVERY} prefetch={false} className={btn}>
            Find a carrier
          </Link>
          <Link href="/safety" prefetch={false} className={btn}>
            Safety tips
          </Link>
        </div>
      </section>
    </main>
  );
}
