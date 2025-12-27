// src/app/press/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Press · QwikSale",
  description:
    "Press resources, boilerplate, and media contact details for QwikSale.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "27 Dec 2025";

export default function PressPage() {
  return (
    <div className="container-page bg-[var(--bg)] py-10 text-[var(--text)]">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] text-white shadow-soft">
        <div className="container-page py-8 text-white">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl text-white">
            Press & Media
          </h1>
          <p className="mt-1 text-sm text-white/80">
            Resources for journalists, creators, and partners covering QwikSale.
          </p>
          <p className="mt-1 text-sm text-white/60">Last updated: {LAST_UPDATED}</p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-6">
          <h2 className="text-lg font-semibold text-[var(--text)]">About QwikSale</h2>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
            QwikSale is a Kenya-first marketplace designed around trust, speed, and safety.
            We help buyers discover listings and help sellers connect with serious customers
            with privacy controls and verification tools.
          </p>

          <h3 className="mt-5 text-sm font-semibold text-[var(--text)]">Boilerplate</h3>
          <div className="mt-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] p-4">
            <p className="text-sm leading-relaxed text-[var(--text)]">
              QwikSale is a modern marketplace for Kenya that helps people buy and sell locally
              with stronger trust signals, verified listings, and privacy-first contact options.
            </p>
          </div>

          <h3 className="mt-5 text-sm font-semibold text-[var(--text)]">Media contact</h3>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
            For press requests, interviews, partnerships, or brand resources, contact:
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a className="btn-gradient-primary" href="mailto:press@qwiksale.sale">
              press@qwiksale.sale
            </a>
            <Link className="btn-outline" href="/contact" prefetch={false}>
              Contact form
            </Link>
          </div>

          <h3 className="mt-5 text-sm font-semibold text-[var(--text)]">Brand assets</h3>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
            If you need logos, screenshots, or product visuals, request them via email and
            specify usage (article, TV, social, etc.). We’ll provide the correct formats.
          </p>

          <hr className="my-6 border-[var(--border-subtle)]" />

          <div className="text-xs leading-relaxed text-[var(--text-muted)]">
            Note: Please do not include personal user data or private listings in publications
            without consent.
          </div>
        </div>

        {/* Sidebar */}
        <aside className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-6">
          <h3 className="text-sm font-semibold text-[var(--text)]">Quick links</h3>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link className="underline underline-offset-2" href="/privacy" prefetch={false}>
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link className="underline underline-offset-2" href="/terms" prefetch={false}>
                Terms of Service
              </Link>
            </li>
            <li>
              <Link className="underline underline-offset-2" href="/cookies" prefetch={false}>
                Cookie Policy
              </Link>
            </li>
            <li>
              <Link className="underline underline-offset-2" href="/contact" prefetch={false}>
                Contact
              </Link>
            </li>
          </ul>

          <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3">
            <div className="text-xs font-semibold text-[var(--text)]">Coverage request</div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
              Include: outlet name, deadline, topic angle, and any specific asset needs.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
