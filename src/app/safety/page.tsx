import type { Metadata } from "next";
import Link from "next/link";
import SectionHeader from "@/app/components/SectionHeader";

export const metadata: Metadata = {
  title: "Safety Guidelines — QwikSale",
  description:
    "Practical tips to stay safe on QwikSale: how to meet, pay, spot scams, protect your data, and report problems.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/safety" },
};

export default function SafetyPage() {
  const lastUpdated = "2025-06-01";

  return (
    <main className="min-h-dvh">
      <div className="container-page py-8">
        <SectionHeader
          title="Safety on QwikSale"
          subtitle="Tips to keep every meetup smooth."
          className="bg-spotlight brand-noise"
        />
        <ul className="mt-3 flex flex-wrap gap-2">
          <li className="chip-outline">Verified profiles</li>
          <li className="chip-outline">In-app messaging</li>
          <li className="chip-outline">Meet in public</li>
        </ul>

        <div className="mx-auto max-w-3xl space-y-6 mt-6">
          {/* Quick summary cards */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="card-surface p-4">
              <h2 className="font-semibold mb-2">Top 3 rules for buyers</h2>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Meet in a well-lit, public place — never at night alone.</li>
                <li>Inspect and test the item before paying.</li>
                <li>Use cash/M-Pesa only after you’re satisfied; avoid “reservation” fees.</li>
              </ul>
            </div>
            <div className="card-surface p-4">
              <h2 className="font-semibold mb-2">Top 3 rules for sellers</h2>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Bring a friend to meet-ups; keep valuables out of sight until ready.</li>
                <li>Confirm full payment (M-Pesa SMS + app balance) before handing over the item.</li>
                <li>Keep records: buyer phone, time, location, and any receipts.</li>
              </ul>
            </div>
          </div>

          {/* Table of contents */}
          <div className="card-surface p-4">
            <h2 className="font-semibold mb-2">On this page</h2>
            <nav className="text-sm grid sm:grid-cols-2 gap-x-6 gap-y-1">
              <a href="#meetups" className="underline">Safe meet-ups</a>
              <a href="#payments" className="underline">Payment safety</a>
              <a href="#redflags" className="underline">Fraud red flags</a>
              <a href="#data" className="underline">Protect your data</a>
              <a href="#delivery" className="underline">Delivery & shipping</a>
              <a href="#reporting" className="underline">Reporting & support</a>
            </nav>
          </div>

          {/* Sections */}
          <section id="meetups" className="prose dark:prose-invert max-w-none card-surface p-5">
            <h2>Safe meet-ups</h2>
            <p className="text-xs text-gray-500 dark:text-slate-400">Last updated {lastUpdated}</p>
            <ul>
              <li>Choose public locations with CCTV (malls, coffee shops, police-approved zones).</li>
              <li>Tell a friend where you’re going; share your live location if possible.</li>
              <li>Daytime meetings are safest. Bring only the cash you intend to spend.</li>
              <li>For electronics, test thoroughly (power on, IMEI, battery health, ports, cameras).</li>
              <li>For vehicles, view logbook, verify seller identity, and consider a mechanic check.</li>
            </ul>
          </section>

          <section id="payments" className="prose dark:prose-invert max-w-none card-surface p-5">
            <h2>Payment safety</h2>
            <ul>
              <li>Prefer M-Pesa or cash in person. Avoid wire transfers and crypto for first-time deals.</li>
              <li>Beware of “overpayment” tricks or requests to “refund the difference”.</li>
              <li>Confirm M-Pesa balance in your app — not just an SMS screenshot.</li>
              <li>Do not pay “reservation”, “token”, or “clearance” fees to strangers.</li>
              <li>Never share one-time passwords (OTP) or PINs with anyone.</li>
            </ul>
          </section>

          <section id="redflags" className="card-surface p-5">
            <h2 className="font-semibold mb-2">Fraud red flags</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              <li>Price is far below market with urgency: “first come, first served, pay now”.</li>
              <li>Refusal to meet, or pushing for courier only, especially for high-value items.</li>
              <li>Request for advance fees, deposits, or payment codes to “verify you”.</li>
              <li>Seller/buyer refuses basic verification (name, phone match, item serials).</li>
              <li>Communication moves immediately to off-platform links that look suspicious.</li>
            </ul>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
              If it feels wrong, walk away. There will always be another deal.
            </p>
          </section>

          <section id="data" className="prose dark:prose-invert max-w-none card-surface p-5">
            <h2>Protect your data</h2>
            <ul>
              <li>Share only what’s needed to complete the sale (first name and phone are usually enough).</li>
              <li>Never share copies of your ID, bank statements, or ATM card photos.</li>
              <li>Use unique, strong passwords for your accounts. Enable 2FA where possible.</li>
              <li>On public Wi-Fi, avoid logging into financial accounts.</li>
            </ul>
          </section>

          <section id="delivery" className="prose dark:prose-invert max-w-none card-surface p-5">
            <h2>Delivery &amp; shipping</h2>
            <ul>
              <li>For courier deals, use trackable services and keep receipts.</li>
              <li>Agree upfront on who pays shipping and what “item not as described” means.</li>
              <li>Unbox on camera upon delivery for proof if a dispute arises.</li>
            </ul>
          </section>

          <section id="reporting" className="card-surface p-5 space-y-3">
            <h2 className="font-semibold">Reporting &amp; support</h2>
            <p className="text-sm">
              If you encounter suspicious behavior, fake items, or harassment, report it so our team can
              investigate and take action.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/report" className="rounded-xl border px-4 py-2 font-semibold hover:bg-gray-50 dark:hover:bg-slate-800">
                Report a problem
              </Link>
              <Link href="/contact" className="rounded-xl border px-4 py-2 font-semibold hover:bg-gray-50 dark:hover:bg-slate-800">
                Contact support
              </Link>
              <Link href="/privacy" className="rounded-xl border px-4 py-2 font-semibold hover:bg-gray-50 dark:hover:bg-slate-800">
                Privacy policy
              </Link>
            </div>
            <div className="text-xs text-gray-600 dark:text-slate-400">
              In an emergency or if you believe a crime has occurred, contact local authorities first.
            </div>
          </section>

          {/* Micro copy */}
          <p className="text-xs text-gray-500">
            QwikSale is a neutral marketplace. We do not hold funds or guarantee transactions. Following these
            guidelines reduces risk but doesn’t eliminate it. Stay alert, trust your instincts, and report issues.
          </p>
        </div>
      </div>
    </main>
  );
}
