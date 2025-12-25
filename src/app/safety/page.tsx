import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Safety Guidelines - QwikSale",
  description:
    "Practical tips to stay safe on QwikSale: how to meet, pay, spot scams, protect your data, and report problems.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/safety" },
};

export default function SafetyPage() {
  const lastUpdated = "2025-06-01";

  return (
    <main className="min-h-dvh bg-[var(--bg)] text-[var(--text)]">
      <div className="container-page py-4 sm:py-6">
        <header className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-soft">
          <div className="h-1.5 w-full bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]" />
          <div className="p-3 sm:p-5">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl md:text-3xl">
              Safety on QwikSale
            </h1>
            <p className="mt-1 text-xs text-[var(--text-muted)] sm:text-sm">
              Tips to keep every meetup smooth.
            </p>
          </div>
        </header>

        <ul className="mt-3 flex flex-wrap gap-2">
          <li className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] font-semibold text-[var(--text)] shadow-sm sm:px-3 sm:text-xs">
            Verified profiles
          </li>
          <li className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] font-semibold text-[var(--text)] shadow-sm sm:px-3 sm:text-xs">
            In-app messaging
          </li>
          <li className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] font-semibold text-[var(--text)] shadow-sm sm:px-3 sm:text-xs">
            Meet in public
          </li>
        </ul>

        <div className="mx-auto mt-4 max-w-3xl space-y-4 sm:mt-6 sm:space-y-6">
          {/* Quick summary cards */}
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-4">
              <h2 className="mb-2 text-sm font-semibold text-[var(--text)] sm:text-base">
                Top 3 rules for buyers
              </h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--text-muted)]">
                <li>Meet in a well-lit, public place - never at night alone.</li>
                <li>Inspect and test the item before paying.</li>
                <li>
                  Use cash/M-Pesa only after you’re satisfied; avoid “reservation” fees.
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-4">
              <h2 className="mb-2 text-sm font-semibold text-[var(--text)] sm:text-base">
                Top 3 rules for sellers
              </h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--text-muted)]">
                <li>
                  Bring a friend to meet-ups; keep valuables out of sight until ready.
                </li>
                <li>
                  Confirm full payment (M-Pesa SMS + app balance) before handing over the item.
                </li>
                <li>Keep records: buyer phone, time, location, and any receipts.</li>
              </ul>
            </div>
          </div>

          {/* Table of contents */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-4">
            <h2 className="mb-2 text-sm font-semibold text-[var(--text)] sm:text-base">
              On this page
            </h2>
            <nav className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <a href="#meetups" className="font-semibold underline underline-offset-4">
                Safe meet-ups
              </a>
              <a href="#payments" className="font-semibold underline underline-offset-4">
                Payment safety
              </a>
              <a href="#redflags" className="font-semibold underline underline-offset-4">
                Fraud red flags
              </a>
              <a href="#data" className="font-semibold underline underline-offset-4">
                Protect your data
              </a>
              <a href="#delivery" className="font-semibold underline underline-offset-4">
                Delivery &amp; shipping
              </a>
              <a href="#reporting" className="font-semibold underline underline-offset-4">
                Reporting &amp; support
              </a>
            </nav>
          </div>

          {/* Sections */}
          <section
            id="meetups"
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-5"
          >
            <h2 className="text-base font-semibold text-[var(--text)] sm:text-lg">
              Safe meet-ups
            </h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Last updated {lastUpdated}
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--text-muted)]">
              <li>Choose public locations with CCTV (malls, coffee shops, police-approved zones).</li>
              <li>Tell a friend where you’re going; share your live location if possible.</li>
              <li>Daytime meetings are safest. Bring only the cash you intend to spend.</li>
              <li>For electronics, test thoroughly (power on, IMEI, battery health, ports, cameras).</li>
              <li>For vehicles, view logbook, verify seller identity, and consider a mechanic check.</li>
            </ul>
          </section>

          <section
            id="payments"
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-5"
          >
            <h2 className="text-base font-semibold text-[var(--text)] sm:text-lg">
              Payment safety
            </h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--text-muted)]">
              <li>Prefer M-Pesa or cash in person. Avoid wire transfers and crypto for first-time deals.</li>
              <li>Beware of “overpayment” tricks or requests to “refund the difference”.</li>
              <li>Confirm M-Pesa balance in your app - not just an SMS screenshot.</li>
              <li>Do not pay “reservation”, “token”, or “clearance” fees to strangers.</li>
              <li>Never share one-time passwords (OTP) or PINs with anyone.</li>
            </ul>
          </section>

          <section
            id="redflags"
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-5"
          >
            <h2 className="mb-2 text-base font-semibold text-[var(--text)] sm:text-lg">
              Fraud red flags
            </h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--text-muted)]">
              <li>Price is far below market with urgency: “first come, first served, pay now”.</li>
              <li>Refusal to meet, or pushing for courier only, especially for high-value items.</li>
              <li>Request for advance fees, deposits, or payment codes to “verify you”.</li>
              <li>Seller/buyer refuses basic verification (name, phone match, item serials).</li>
              <li>Communication moves immediately to off-platform links that look suspicious.</li>
            </ul>
            <p className="mt-2 text-xs font-semibold text-[var(--text)]">
              If it feels wrong, walk away. There will always be another deal.
            </p>
          </section>

          <section
            id="data"
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-5"
          >
            <h2 className="text-base font-semibold text-[var(--text)] sm:text-lg">
              Protect your data
            </h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--text-muted)]">
              <li>Share only what’s needed to complete the sale (first name and phone are usually enough).</li>
              <li>Never share copies of your ID, bank statements, or ATM card photos.</li>
              <li>Use unique, strong passwords for your accounts. Enable 2FA where possible.</li>
              <li>On public Wi-Fi, avoid logging into financial accounts.</li>
            </ul>
          </section>

          <section
            id="delivery"
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-5"
          >
            <h2 className="text-base font-semibold text-[var(--text)] sm:text-lg">
              Delivery &amp; shipping
            </h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--text-muted)]">
              <li>For courier deals, use trackable services and keep receipts.</li>
              <li>Agree upfront on who pays shipping and what “item not as described” means.</li>
              <li>Unbox on camera upon delivery for proof if a dispute arises.</li>
            </ul>
          </section>

          <section
            id="reporting"
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-5"
          >
            <h2 className="text-base font-semibold text-[var(--text)] sm:text-lg">
              Reporting &amp; support
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
              If you encounter suspicious behavior, fake items, or harassment, report it so our team
              can investigate and take action.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/report"
                className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus sm:px-4"
              >
                Report a problem
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus sm:px-4"
              >
                Contact support
              </Link>
              <Link
                href="/privacy"
                className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus sm:px-4"
              >
                Privacy policy
              </Link>
            </div>

            <div className="mt-3 text-xs text-[var(--text-muted)]">
              In an emergency or if you believe a crime has occurred, contact local authorities first.
            </div>
          </section>

          {/* Micro copy */}
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            QwikSale is a neutral marketplace. We do not hold funds or guarantee transactions.
            Following these guidelines reduces risk but doesn’t eliminate it. Stay alert, trust your
            instincts, and report issues.
          </p>
        </div>
      </div>
    </main>
  );
}
