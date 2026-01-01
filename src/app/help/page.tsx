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
          Find answers or reach support
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--text-muted)]">
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
          <Link href="/report" prefetch={false} className="btn-outline text-sm">
            Report a Problem
          </Link>
        </div>
      </header>

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

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-[var(--text)]">
          Frequently Asked Questions
        </h2>

        <div
          className={[
            "mt-4 divide-y rounded-xl border shadow-sm",
            "divide-[var(--border-subtle)] border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
          ].join(" ")}
        >
          <details className="group p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="font-medium text-[var(--text)]">
                How do I create an account?
              </span>
              <span className="text-sm text-[var(--text-muted)] group-open:hidden">
                Show
              </span>
              <span className="hidden text-sm text-[var(--text-muted)] group-open:inline">
                Hide
              </span>
            </summary>
            <div className="mt-2 text-sm leading-relaxed text-[var(--text)]">
              Go to{" "}
              <Link
                className="underline decoration-[var(--border)] underline-offset-2"
                href="/signup"
                prefetch={false}
              >
                Create account
              </Link>
              , enter your email &amp; password, or continue with Google. After
              signing up, complete your{" "}
              <Link
                className="underline decoration-[var(--border)] underline-offset-2"
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
              <span className="font-medium text-[var(--text)]">
                How do I post a listing?
              </span>
              <span className="text-sm text-[var(--text-muted)] group-open:hidden">
                Show
              </span>
              <span className="hidden text-sm text-[var(--text-muted)] group-open:inline">
                Hide
              </span>
            </summary>
            <div className="mt-2 text-sm leading-relaxed text-[var(--text)]">
              Visit{" "}
              <Link
                className="underline decoration-[var(--border)] underline-offset-2"
                href="/sell"
                prefetch={false}
              >
                Post a listing
              </Link>
              , choose a category, add photos, price (or leave 0 for “Contact
              for price”), and publish. Verified listings may get boosted
              placement.
            </div>
          </details>

          <details className="group p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="font-medium text-[var(--text)]">
                How do I save or share items?
              </span>
              <span className="text-sm text-[var(--text-muted)] group-open:hidden">
                Show
              </span>
              <span className="hidden text-sm text-[var(--text-muted)] group-open:inline">
                Hide
              </span>
            </summary>
            <div className="mt-2 text-sm leading-relaxed text-[var(--text)]">
              Tap the heart on a product page to save it. Access everything
              under{" "}
              <Link
                className="underline decoration-[var(--border)] underline-offset-2"
                href="/saved"
                prefetch={false}
              >
                Saved
              </Link>
              . Use the “Copy” button on a product card to share a direct link.
            </div>
          </details>

          <details className="group p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="font-medium text-[var(--text)]">
                How do payments work?
              </span>
              <span className="text-sm text-[var(--text-muted)] group-open:hidden">
                Show
              </span>
              <span className="hidden text-sm text-[var(--text-muted)] group-open:inline">
                Hide
              </span>
            </summary>
            <div className="mt-2 text-sm leading-relaxed text-[var(--text)]">
              QwikSale is a neutral marketplace. Coordinate with the seller
              directly. Prefer in-person meetups in public places and confirm
              item condition before paying. For tips, see{" "}
              <Link
                className="underline decoration-[var(--border)] underline-offset-2"
                href="/safety"
                prefetch={false}
              >
                Safety
              </Link>
              .
            </div>
          </details>

          <details className="group p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="font-medium text-[var(--text)]">
                I can’t sign in / Google loop
              </span>
              <span className="text-sm text-[var(--text-muted)] group-open:hidden">
                Show
              </span>
              <span className="hidden text-sm text-[var(--text-muted)] group-open:inline">
                Hide
              </span>
            </summary>
            <div className="mt-2 text-sm leading-relaxed text-[var(--text)]">
              Clear cookies for{" "}
              <span className="font-mono">qwiksale.sale</span>, ensure
              third-party cookies are allowed, and try again. If you signed up
              with Google before, use <strong>Continue with Google</strong>.
              Still stuck?{" "}
              <Link
                className="underline decoration-[var(--border)] underline-offset-2"
                href="/contact"
                prefetch={false}
              >
                Contact Support
              </Link>
              .
            </div>
          </details>
        </div>
      </section>

      <section
        className={[
          "mt-8 rounded-2xl border p-5 shadow-sm",
          "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)]",
        ].join(" ")}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">
              Need personal help?
            </h2>
            <p className="text-sm leading-relaxed text-[var(--text-muted)]">
              Our team responds within 1-2 business days.
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
