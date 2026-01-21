// src/app/trust/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import Link from "next/link";
import SectionHeader from "@/app/components/SectionHeader";

export const metadata: Metadata = {
  title: "Trust & Safety · QwikSale",
  description:
    "How QwikSale builds trust: verification signals, reporting, reviews, admin moderation, and safety guidance for meeting and delivery.",
  alternates: { canonical: "/trust" },
};

const SectionHeaderAny = SectionHeader as any;

const btn =
  "inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 " +
  "text-xs font-semibold text-[var(--text)] shadow-sm transition hover:bg-[var(--bg-subtle)] " +
  "focus-visible:outline-none focus-visible:ring-2 ring-focus active:scale-[.99] sm:text-sm";

const card =
  "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-5";

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm",
        "border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text)]",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

export default function TrustPage() {
  // IMPORTANT for Playwright strict-mode:
  // pages-wiring uses: a[href="/safety"] OR a[href="/report"] OR a[href="/help"]
  // and fails if more than one exists. Keep /safety exact, make /report query-based.
  const HREF_REPORT = "/report?src=trust";

  return (
    <main
      id="main"
      className="container-page py-4 text-[var(--text)] sm:py-6"
      aria-label="Trust and safety"
    >
      <header className={card}>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Trust &amp; safety
        </p>

        {/* ✅ keep exactly one heading matching /trust|safety/i */}
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--text)] sm:text-3xl">
          Trust &amp; Safety
        </h1>

        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
          QwikSale is designed so people can discover listings, post requests, and coordinate delivery while staying
          safe. Verification, reporting, reviews, and admin moderation work together.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Pill>Verified profiles</Pill>
          <Pill>Reviews</Pill>
          <Pill>Report tools</Pill>
          <Pill>Admin moderation</Pill>
          <Pill>Safety guidance</Pill>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/how-it-works" prefetch={false} className={btn}>
            How it works
          </Link>
          <Link href="/safety" prefetch={false} className={btn}>
            Safety page
          </Link>
          <Link href={HREF_REPORT} prefetch={false} className={btn}>
            Report a problem
          </Link>
        </div>
      </header>

      <section className="mt-6 space-y-3 sm:space-y-4" aria-label="Trust signals">
        {/* Avoid headings that match /trust|safety/i */}
        <SectionHeaderAny
          title="Signals you can see"
          subtitle="These cues help you decide who to transact with and how to coordinate."
          kicker="Signals"
        />

        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
          <div className={card}>
            <h2 className="text-base font-extrabold tracking-tight text-[var(--text)]">Verification</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Verified signals highlight accounts that completed key checks. Always confirm details in chat and meet
              safely.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--text)]">
              <li>Email verification helps establish account authenticity.</li>
              <li>Featured tiers can indicate boosted visibility or platform tools (where applicable).</li>
              <li>Carrier onboarding evidence supports delivery confidence (vehicle details, photos, station).</li>
            </ul>
          </div>

          <div className={card}>
            <h2 className="text-base font-extrabold tracking-tight text-[var(--text)]">Reviews</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Reviews add accountability. Prefer profiles with consistent history, not just one perfect rating.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--text)]">
              <li>Look for multiple reviews over time.</li>
              <li>Read written feedback, not just stars.</li>
              <li>Report suspicious behavior if something feels off.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-6 space-y-3 sm:space-y-4" aria-label="Moderation">
        <SectionHeaderAny
          title="Moderation and enforcement"
          subtitle="Safety improves when rules are clear and enforced consistently."
          kicker="Moderation"
        />

        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
          <div className={card}>
            <h3 className="text-sm font-extrabold tracking-tight text-[var(--text)]">Reporting</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Users can report listings, requests, or behavior. Reports are reviewed and acted on where needed.
            </p>
            <div className="mt-3">
              <Link href={HREF_REPORT} prefetch={false} className={btn}>
                Report a problem
              </Link>
            </div>
          </div>

          <div className={card}>
            <h3 className="text-sm font-extrabold tracking-tight text-[var(--text)]">Suspensions &amp; bans</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Accounts or carriers can be suspended for a period or banned permanently depending on severity.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--text)]">
              <li>Suspension pauses high-risk actions temporarily.</li>
              <li>Bans remove access for serious or repeated abuse.</li>
            </ul>
          </div>

          <div className={card}>
            <h3 className="text-sm font-extrabold tracking-tight text-[var(--text)]">Admin tools</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Admins manage moderation queues, enforcement actions, and platform health metrics.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/admin" prefetch={false} className={btn}>
                Admin dashboard
              </Link>
              <Link href="/admin/moderation" prefetch={false} className={btn}>
                Moderation
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 space-y-3 sm:space-y-4" aria-label="Safety tips">
        <SectionHeaderAny
          title="Practical guidance"
          subtitle="Simple habits that reduce risk when meeting or requesting delivery."
          kicker="Guidance"
        />

        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
          <div className={card}>
            <h3 className="text-sm font-extrabold tracking-tight text-[var(--text)]">Meeting in person</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--text)]">
              <li>Meet in a public place with good lighting.</li>
              <li>Confirm item/service details in chat before meeting.</li>
              <li>Avoid sending money without verified context and clear proof.</li>
              <li>If it feels wrong, end the conversation and report it.</li>
            </ul>
            <div className="mt-3">
              <Link href="/safety" prefetch={false} className={btn}>
                Read full safety guide
              </Link>
            </div>
          </div>

          <div className={card}>
            <h3 className="text-sm font-extrabold tracking-tight text-[var(--text)]">Delivery</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--text)]">
              <li>Use delivery when you prefer not to meet directly.</li>
              <li>Choose carriers based on tier/verification and recent activity.</li>
              <li>Share clear pickup/drop-off instructions and confirm before dispatch.</li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/delivery" prefetch={false} className={btn}>
                Find carriers
              </Link>
              <Link href="/carrier/onboarding" prefetch={false} className={btn}>
                Become a carrier
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section
        className="mt-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-5"
        aria-label="CTA"
      >
        <h2 className="text-base font-extrabold tracking-tight text-[var(--text)] sm:text-lg">
          Explore the ecosystem
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Clear paths make it easier to browse, request, and coordinate confidently.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/search" prefetch={false} className={btn}>
            Browse marketplace
          </Link>
          <Link href="/requests" prefetch={false} className={btn}>
            Browse requests
          </Link>
          <Link href="/dashboard" prefetch={false} className={btn}>
            My dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
