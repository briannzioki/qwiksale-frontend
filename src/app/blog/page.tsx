// src/app/blog/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Blog · QwikSale",
  description:
    "Product updates, safety tips, and marketplace insights from QwikSale.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "27 Dec 2025";

export default function BlogPage() {
  return (
    <div className="container-page bg-[var(--bg)] py-10 text-[var(--text)]">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] text-white shadow-soft">
        <div className="container-page py-8 text-white">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl text-white">
            QwikSale Blog
          </h1>
          <p className="mt-1 text-sm text-white/80">
            Updates, safety tips, and guides for buying and selling smarter.
          </p>
          <p className="mt-1 text-sm text-white/60">Last updated: {LAST_UPDATED}</p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-6">
          <h2 className="text-lg font-semibold text-[var(--text)]">Coming soon</h2>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
            We’ll publish product updates, scam-avoidance tips, and short guides to help you
            get the best results on QwikSale.
          </p>

          <div className="mt-4 grid gap-3">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] p-4">
              <div className="text-sm font-semibold text-[var(--text)]">
                Safety checklist for meet-ups
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                Practical tips to avoid scams and stay safe when meeting buyers or sellers.
              </p>
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">Draft • Not published</p>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] p-4">
              <div className="text-sm font-semibold text-[var(--text)]">
                How verification improves trust
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                Why verified listings and verified profiles matter - and how we enforce it.
              </p>
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">Draft • Not published</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link href="/" className="btn-outline" prefetch={false}>
              Back to home
            </Link>
            <Link href="/contact" className="btn-gradient-primary" prefetch={false}>
              Suggest a topic
            </Link>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-6">
          <h3 className="text-sm font-semibold text-[var(--text)]">What you’ll see here</h3>
          <ul className="mt-3 space-y-2 text-sm text-[var(--text-muted)]">
            <li>• Product updates & release notes</li>
            <li>• Safety and anti-scam guides</li>
            <li>• Tips for better listings</li>
            <li>• Marketplace insights in Kenya</li>
          </ul>

          <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3">
            <div className="text-xs font-semibold text-[var(--text)]">Want updates?</div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
              For now, follow our updates via the app and announcements. If you want an email
              digest, request it via the contact page.
            </p>
            <Link
              href="/contact"
              prefetch={false}
              className="mt-2 inline-flex text-xs font-semibold text-[var(--text)] underline underline-offset-2"
            >
              Contact us
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
