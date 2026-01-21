// src/app/help/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Help Center - QwikSale",
  description:
    "Get help using QwikSale: accounts, marketplace listings (products & services), requests, delivery/carriers, trust & safety, and payments. Contact support or report a problem.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/help" },
};

function Card({
  title,
  children,
  href,
}: {
  title: string;
  children: ReactNode;
  href?: string;
}) {
  const inner = (
    <div
      className={[
        "group block rounded-xl border p-5 shadow-sm transition",
        "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)]",
        "hover:bg-[var(--bg-subtle)]",
      ].join(" ")}
    >
      <h3 className="font-semibold text-[var(--text)]">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
        {children}
      </p>
    </div>
  );

  return href ? (
    <Link
      href={href}
      prefetch={false}
      className="rounded-xl focus-visible:outline-none focus-visible:ring-2 ring-focus"
    >
      {inner}
    </Link>
  ) : (
    inner
  );
}

function FAQItem({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between">
        <span className="font-medium text-[var(--text)]">{q}</span>
        <span className="text-sm text-[var(--text-muted)] group-open:hidden">
          Show
        </span>
        <span className="hidden text-sm text-[var(--text-muted)] group-open:inline">
          Hide
        </span>
      </summary>
      <div className="mt-2 text-sm leading-relaxed text-[var(--text)]">
        {children}
      </div>
    </details>
  );
}

export default function HelpCenterPage() {
  return (
    <main className="container-page py-8">
      <header
        className={[
          "rounded-2xl border p-5 shadow-sm",
          "border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
        ].join(" ")}
      >
        <p className="text-sm leading-5 text-[var(--text-muted)]">Help Center</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[var(--text)]">
          Find answers across the QwikSale ecosystem
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--text-muted)]">
          QwikSale connects accounts, marketplace listings (products &amp;
          services), requests, delivery/carriers, trust &amp; safety tools, and
          Kenya-first payments. Start with the topic below, or message support.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/contact" prefetch={false} className="btn-gradient-primary text-sm">
            Contact Support
          </Link>
          <Link href="/report" prefetch={false} className="btn-outline text-sm">
            Report a Problem
          </Link>
          <Link href="/how-it-works" prefetch={false} className="btn-outline text-sm">
            How it works
          </Link>
        </div>
      </header>

      <section className="mt-6 grid gap-4 md:grid-cols-3" aria-label="Quick help shortcuts">
        <Card title="Browse the marketplace" href="/search">
          Search products &amp; services, apply filters, and open listings.
        </Card>
        <Card title="Post a listing" href="/sell">
          Create a product or service listing with photos, pricing, and location.
        </Card>
        <Card title="Trust & safety" href="/trust">
          Verification signals, reporting, reviews, and safe meetups.
        </Card>

        <Card title="Requests (buyers need something)" href="/requests">
          Post a request, browse requests, and contact sellers who can help.
        </Card>
        <Card title="Delivery & carriers" href="/delivery">
          Find nearby carriers and request delivery for a product or store context.
        </Card>
        <Card title="Carrier profile" href="/carrier">
          Register as a carrier, manage availability, and follow enforcement rules.
        </Card>
      </section>

      <section className="mt-8" aria-label="Frequently asked questions">
        <h2 className="text-lg font-semibold text-[var(--text)]">
          Frequently Asked Questions
        </h2>

        <div
          className={[
            "mt-4 divide-y rounded-xl border shadow-sm",
            "divide-[var(--border-subtle)] border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
          ].join(" ")}
        >
          <FAQItem q="How do I create an account and complete my profile?">
            Go to{" "}
            <Link
              className="underline decoration-[var(--border)] underline-offset-2"
              href="/signup"
              prefetch={false}
            >
              Create account
            </Link>{" "}
            (email/password or Google). After signing up, complete your{" "}
            <Link
              className="underline decoration-[var(--border)] underline-offset-2"
              href="/account/complete-profile"
              prefetch={false}
            >
              profile
            </Link>{" "}
            and optionally verify your email to improve trust signals and reduce friction.
          </FAQItem>

          <FAQItem q="How do I search and filter listings?">
            Use{" "}
            <Link
              className="underline decoration-[var(--border)] underline-offset-2"
              href="/search"
              prefetch={false}
            >
              Search
            </Link>{" "}
            to browse products &amp; services. You can filter by category/subcategory, location,
            price range, and other options. Switching tabs (products/services) should update the URL and refetch results.
          </FAQItem>

          <FAQItem q="How do I post a product or service listing?">
            Visit{" "}
            <Link
              className="underline decoration-[var(--border)] underline-offset-2"
              href="/sell"
              prefetch={false}
            >
              Post a listing
            </Link>{" "}
            and choose Product or Service. Add clear photos, a descriptive title, category/subcategory,
            location, and price (or leave 0 for “Contact for price”), then publish.
          </FAQItem>

          <FAQItem q="What are Requests, and how do they work?">
            Requests let buyers post what they need (e.g., “Need a used iPhone 12 under 40k” or “Looking for a plumber”).
            Browse requests in{" "}
            <Link
              className="underline decoration-[var(--border)] underline-offset-2"
              href="/requests"
              prefetch={false}
            >
              Requests
            </Link>
            . Opening some request details may require sign-in. If you can help, contact the requester and agree on terms safely.
          </FAQItem>

          <FAQItem q="How do I request delivery for a listing?">
            On product/service pages, you’ll see delivery actions that deep-link into{" "}
            <Link
              className="underline decoration-[var(--border)] underline-offset-2"
              href="/delivery"
              prefetch={false}
            >
              Delivery
            </Link>{" "}
            with store/product context when available. Delivery requires sign-in. Choose a carrier near the store or your area, then coordinate pickup and drop-off.
          </FAQItem>

          <FAQItem q="How do I become a carrier?">
            Go to{" "}
            <Link
              className="underline decoration-[var(--border)] underline-offset-2"
              href="/carrier"
              prefetch={false}
            >
              Carrier
            </Link>
            . If you don’t have a carrier profile yet, you’ll be guided to onboarding at{" "}
            <Link
              className="underline decoration-[var(--border)] underline-offset-2"
              href="/carrier/onboarding"
              prefetch={false}
            >
              /carrier/onboarding
            </Link>
            . Carrier enforcement fields (ban/suspend) are applied by admin; if banned/suspended, carrier actions are disabled until cleared.
          </FAQItem>

          <FAQItem q="How do verification badges and trust signals work?">
            You may see “Verified/Unverified” badges and tier signals on listings and seller profiles. These help buyers assess trust
            (for example: verified email, good reviews, consistent behavior). Always verify details in chat and meet safely. Learn more on{" "}
            <Link
              className="underline decoration-[var(--border)] underline-offset-2"
              href="/trust"
              prefetch={false}
            >
              Trust
            </Link>{" "}
            and{" "}
            <Link
              className="underline decoration-[var(--border)] underline-offset-2"
              href="/safety"
              prefetch={false}
            >
              Safety
            </Link>
            .
          </FAQItem>

          <FAQItem q="How do I save items or share a listing?">
            Tap the heart to save a product/service. Your saved items live under{" "}
            <Link
              className="underline decoration-[var(--border)] underline-offset-2"
              href="/saved"
              prefetch={false}
            >
              Saved
            </Link>
            . On listing pages, use the “Copy” action to copy a shareable link.
          </FAQItem>

          <FAQItem q="How do messages work?">
            Messages let buyers and sellers coordinate without exposing too much personal data up front. Visit{" "}
            <Link
              className="underline decoration-[var(--border)] underline-offset-2"
              href="/messages"
              prefetch={false}
            >
              Messages
            </Link>{" "}
            (sign-in required). If you’re not signed in, you’ll see a clear sign-in CTA instead of a crash.
          </FAQItem>

          <FAQItem q="How do payments work (M-Pesa)?">
            QwikSale is a marketplace and coordination layer. Prefer safe meetups, confirm items before paying, and verify M-Pesa messages.
            For platform payments like tests/donations/upgrade flows, use the Kenya-first payment page at{" "}
            <Link
              className="underline decoration-[var(--border)] underline-offset-2"
              href="/pay"
              prefetch={false}
            >
              /pay
            </Link>
            . Never share your M-Pesa PIN.
          </FAQItem>

          <FAQItem q="How do I reset my password?">
            Use{" "}
            <Link
              className="underline decoration-[var(--border)] underline-offset-2"
              href="/reset-password"
              prefetch={false}
            >
              Reset password
            </Link>{" "}
            to request a reset link or set a new password if you already have a token.
            If you signed up with Google, use “Continue with Google” on{" "}
            <Link
              className="underline decoration-[var(--border)] underline-offset-2"
              href="/signin"
              prefetch={false}
            >
              Sign in
            </Link>
            .
          </FAQItem>

          <FAQItem q="I can’t sign in / Google loop">
            Clear cookies for <span className="font-mono">qwiksale.sale</span>, ensure cookies are allowed, then try again.
            If you signed up with Google before, use <strong>Continue with Google</strong>.
            Still stuck?{" "}
            <Link
              className="underline decoration-[var(--border)] underline-offset-2"
              href="/contact"
              prefetch={false}
            >
              Contact Support
            </Link>
            .
          </FAQItem>
        </div>
      </section>

      <section
        className={[
          "mt-8 rounded-2xl border p-5 shadow-sm",
          "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)]",
        ].join(" ")}
        aria-label="Contact support"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">
              Need personal help?
            </h2>
            <p className="text-sm leading-relaxed text-[var(--text-muted)]">
              Contact support or report a safety issue. We typically respond within 1–2 business days.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/contact" prefetch={false} className="btn-gradient-primary">
              Contact Support
            </Link>
            <Link href="/report" prefetch={false} className="btn-outline">
              Report a Problem
            </Link>
            <Link href="/safety" prefetch={false} className="btn-outline">
              Safety
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
