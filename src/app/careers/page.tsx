// src/app/careers/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Careers · QwikSale",
  description:
    "Join QwikSale. Explore openings, learn about our mission, and apply to help build a safer marketplace for Kenya.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "27 Dec 2025";

export default function CareersPage() {
  return (
    <div className="container-page bg-[var(--bg)] py-10 text-[var(--text)]">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] text-white shadow-soft">
        <div className="container-page py-8 text-white">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl text-white">
            Careers at QwikSale
          </h1>
          <p className="mt-1 text-sm text-white/80">
            Help build a safer, faster marketplace for Kenya where buyers and sellers can
            transact with confidence.
          </p>
          <p className="mt-1 text-sm text-white/60">Last updated: {LAST_UPDATED}</p>
        </div>
      </div>

      <div className="mt-8 prose max-w-3xl dark:prose-invert">
        <p className="text-sm">
          We’re building QwikSale to make local commerce simpler and safer from discovery to
          verified listings, contact privacy, and strong account protection. If you care about
          trust, performance, and clean UX, you’ll fit right in.
        </p>

        <h2 id="mission">Our mission</h2>
        <ul>
          <li>Increase trust through verification and strong safety controls.</li>
          <li>Make buying/selling faster with great search and listing tools.</li>
          <li>Respect user privacy and reduce spam across the platform.</li>
        </ul>

        <h2 id="values">What we value</h2>
        <ul>
          <li>
            <strong>Security-first:</strong> protect users and reduce abuse by default.
          </li>
          <li>
            <strong>Speed & clarity:</strong> performance and UI/UX matter always.
          </li>
          <li>
            <strong>Ownership:</strong> we ship improvements, measure, and iterate.
          </li>
          <li>
            <strong>Practicality:</strong> we prioritize what helps real users in Kenya.
          </li>
        </ul>

        <h2 id="openings">Open roles</h2>
        <div className="not-prose rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft">
          <div className="text-sm font-semibold text-[var(--text)]">No public roles right now</div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
            We’re still growing. If you want to be considered for future openings, send your CV
            and a short note about what you’d improve in QwikSale.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              className="btn-gradient-primary"
              href="mailto:careers@qwiksale.sale?subject=QwikSale%20Careers%20Interest"
            >
              Email careers@qwiksale.sale
            </a>
            <Link className="btn-outline" href="/contact" prefetch={false}>
              Contact form
            </Link>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
            Tip: Include your location/timezone, preferred role (frontend/backend/design),
            and links (GitHub/portfolio).
          </p>
        </div>

        <h2 id="process">Hiring process</h2>
        <ol>
          <li>Quick screening (email / short form).</li>
          <li>Practical task (small, time-boxed) or portfolio review.</li>
          <li>Interview (product thinking + execution).</li>
          <li>Offer.</li>
        </ol>

        <h2 id="faq">FAQ</h2>
        <h3>Do you support remote work?</h3>
        <p>
          Yes - Depending on the role. For some work (e.g., partnerships or operations) we may
          require local availability.
        </p>

        <h3>How do I stand out?</h3>
        <p>
          Send real work: shipped projects, design studies, performance/security improvements,
          or anything that shows strong execution.
        </p>

        <hr />
        <p className="text-xs opacity-75">
          QwikSale is an equal opportunity environment. If you need accommodations during the
          process, reach out via email.
        </p>
      </div>
    </div>
  );
}
