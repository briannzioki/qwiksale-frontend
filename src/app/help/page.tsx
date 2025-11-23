// src/app/help/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Help Center — QwikSale",
  description:
    "Get help using QwikSale: account issues, posting and managing listings, safety, and payments. Contact support or report a problem.",
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
    <div className="card group block rounded-xl border border-border bg-card p-5 text-foreground shadow-sm transition hover:shadow-md">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  );
  return href ? (
    <Link href={href} prefetch={false} className="focus:outline-none">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export default function HelpCenterPage() {
  return (
    <main className="container-page py-8">
      {/* Simple, self-contained header (no shared component assumptions) */}
      <header className="rounded-2xl bg-spotlight brand-noise p-5 text-white">
        <p className="text-sm/5 opacity-90">Help Center</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Find answers or reach support
        </h1>
        <p className="mt-2 max-w-prose text-sm text-white/90">
          Common tasks, FAQs, and ways to contact the team. If you’re stuck,
          message us and we’ll help.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/contact"
            prefetch={false}
            className="btn-gradient-primary text-sm"
          >
            Contact Support
          </Link>
          <Link
            href="/report"
            prefetch={false}
            className="btn-outline text-sm"
          >
            Report a Problem
          </Link>
        </div>
      </header>

      {/* Quick links */}
      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <Card title="Contact Support" href="/contact">
          Message us about account, billing, or product questions.
        </Card>
        <Card title="Report a Problem" href="/report">
          Flag suspicious activity, scams, or listing issues.
        </Card>
        <Card title="Safety Guidelines" href="/safety">
          Meet-up tips, payments, and staying safe on QwikSale.
        </Card>
      </section>

      {/* FAQs (native details/summary) */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">
          Frequently Asked Questions
        </h2>
        <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-card brand-noise shadow-sm">
          <details className="group p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="font-medium text-foreground">
                How do I create an account?
              </span>
              <span className="text-sm text-muted-foreground group-open:hidden">
                Show
              </span>
              <span className="hidden text-sm text-muted-foreground group-open:inline">
                Hide
              </span>
            </summary>
            <div className="mt-2 text-sm text-foreground">
              Go to{" "}
              <Link className="underline" href="/signup" prefetch={false}>
                Create account
              </Link>
              , enter your email &amp; password, or continue with Google.
              After signing up, complete your{" "}
              <Link
                className="underline"
                href="/account/profile"
                prefetch={false}
              >
                profile
              </Link>{" "}
              for better trust.
            </div>
          </details>

          <details className="group p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="font-medium text-foreground">
                How do I post a listing?
              </span>
              <span className="text-sm text-muted-foreground group-open:hidden">
                Show
              </span>
              <span className="hidden text-sm text-muted-foreground group-open:inline">
                Hide
              </span>
            </summary>
            <div className="mt-2 text-sm text-foreground">
              Visit{" "}
              <Link className="underline" href="/sell" prefetch={false}>
                Post a listing
              </Link>
              , choose a category, add photos, price (or leave 0 for “Contact
              for price”), and publish. Verified listings may get boosted
              placement.
            </div>
          </details>

          <details className="group p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="font-medium text-foreground">
                How do I save or share items?
              </span>
              <span className="text-sm text-muted-foreground group-open:hidden">
                Show
              </span>
              <span className="hidden text-sm text-muted-foreground group-open:inline">
                Hide
              </span>
            </summary>
            <div className="mt-2 text-sm text-foreground">
              Tap the heart on a product page to save it. Access everything
              under{" "}
              <Link className="underline" href="/saved" prefetch={false}>
                Saved
              </Link>
              . Use the “Copy” button on a product card to share a direct link.
            </div>
          </details>

          <details className="group p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="font-medium text-foreground">
                How do payments work?
              </span>
              <span className="text-sm text-muted-foreground group-open:hidden">
                Show
              </span>
              <span className="hidden text-sm text-muted-foreground group-open:inline">
                Hide
              </span>
            </summary>
            <div className="mt-2 text-sm text-foreground">
              QwikSale is a neutral marketplace. Coordinate with the seller
              directly. Prefer in-person meetups in public places and confirm
              item condition before paying. For tips, see{" "}
              <Link className="underline" href="/safety" prefetch={false}>
                Safety
              </Link>
              .
            </div>
          </details>

          <details className="group p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="font-medium text-foreground">
                I can’t sign in / Google loop
              </span>
              <span className="text-sm text-muted-foreground group-open:hidden">
                Show
              </span>
              <span className="hidden text-sm text-muted-foreground group-open:inline">
                Hide
              </span>
            </summary>
            <div className="mt-2 text-sm text-foreground">
              Clear cookies for{" "}
              <span className="font-mono">qwiksale.sale</span>, ensure
              third-party cookies are allowed, and try again. If you signed up
              with Google before, use <strong>Continue with Google</strong>.
              Still stuck?{" "}
              <Link className="underline" href="/contact" prefetch={false}>
                Contact Support
              </Link>
              .
            </div>
          </details>
        </div>
      </section>

      {/* Contact strip */}
      <section className="mt-8 card rounded-2xl bg-card p-5 text-foreground shadow-sm brand-noise">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Need personal help?</h2>
            <p className="text-sm text-muted-foreground">
              Our team responds within 1–2 business days.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/contact"
              prefetch={false}
              className="btn-gradient-primary"
            >
              Contact Support
            </Link>
            <Link href="/report" prefetch={false} className="btn-outline">
              Report a Problem
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
