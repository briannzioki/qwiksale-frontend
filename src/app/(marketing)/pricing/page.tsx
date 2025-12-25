import type { Metadata } from "next";
import Link from "next/link";
import SectionHeader from "@/app/components/SectionHeader";

export const metadata: Metadata = {
  title: "Pricing · QwikSale",
  description: "Simple pricing that scales with you.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/pricing" },
};

function fmtKES(n: number) {
  try {
    return `KES ${new Intl.NumberFormat("en-KE", {
      maximumFractionDigits: 0,
    }).format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

function PlanCard({
  name,
  price,
  period = "mo",
  features,
  ctaHref,
  highlight = false,
}: {
  name: string;
  price: number;
  period?: "mo" | "yr";
  features: string[];
  ctaHref: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={[
        "flex flex-col rounded-2xl border bg-[var(--bg-elevated)] p-3 sm:p-6 text-[var(--text)] shadow-soft",
        highlight
          ? "border-[var(--border)] ring-1 ring-[var(--border)]"
          : "border-[var(--border-subtle)]",
      ].join(" ")}
    >
      <div className="mb-2 text-xs sm:text-sm uppercase tracking-wide text-[var(--text-muted)]">
        {name}
      </div>

      <div className="flex items-end gap-1">
        <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text)]">
          {fmtKES(price)}
        </div>
        <div className="pb-1 text-[11px] sm:text-xs text-[var(--text-muted)]">
          /{period}
        </div>
      </div>

      <ul className="mt-3 sm:mt-4 space-y-1.5 sm:space-y-2 text-xs sm:text-sm leading-relaxed text-[var(--text-muted)]">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span aria-hidden>✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Link
        href={ctaHref}
        className={[
          "mt-4 sm:mt-6 inline-flex min-h-9 items-center justify-center rounded-xl px-3 py-2 text-xs sm:px-4 sm:py-2 sm:text-sm font-semibold transition",
          "focus-visible:outline-none focus-visible:ring-2 ring-focus active:scale-[.99]",
          highlight
            ? "bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] text-white hover:opacity-95"
            : "border border-[var(--border-subtle)] text-[var(--text)] hover:bg-[var(--bg-subtle)]",
        ].join(" ")}
        aria-label={`Choose ${name}`}
        prefetch={false}
      >
        {highlight ? "Get started" : "Choose plan"}
      </Link>
    </div>
  );
}

const SectionHeaderAny = SectionHeader as any;

export default function PricingPage() {
  return (
    <main className="bg-[var(--bg)] text-[var(--text)]">
      <SectionHeaderAny
        title="Pricing"
        subtitle="Start free. Upgrade when you’re ready for more visibility."
      />

      <div className="container-page py-4 sm:py-6 md:py-10">
        <ul className="mt-3 flex gap-2 overflow-x-auto whitespace-nowrap [-webkit-overflow-scrolling:touch] pb-1 sm:flex-wrap sm:overflow-visible sm:whitespace-normal">
          <li className="inline-flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] sm:px-2.5 sm:py-1.5 sm:text-xs font-medium text-[var(--text-muted)]">
            No contracts
          </li>
          <li className="inline-flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] sm:px-2.5 sm:py-1.5 sm:text-xs font-medium text-[var(--text-muted)]">
            Cancel anytime
          </li>
          <li className="inline-flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] sm:px-2.5 sm:py-1.5 sm:text-xs font-medium text-[var(--text-muted)]">
            M-Pesa ready
          </li>
        </ul>

        {/* Plans */}
        <section className="mt-4 sm:mt-6 grid gap-3 sm:gap-6 md:grid-cols-3">
          <PlanCard
            name="Free"
            price={0}
            features={[
              "Unlimited browsing",
              "Post up to 3 active listings",
              "Direct calls & WhatsApp",
              "Basic search visibility",
            ]}
            ctaHref="/signin?callbackUrl=%2Fsell"
          />
          <PlanCard
            name="Starter"
            price={499}
            features={[
              "Up to 10 active listings",
              "Priority placement in category",
              "Featured badge (1 listing)",
              "Basic insights",
            ]}
            ctaHref="/account/billing"
            highlight
          />
          <PlanCard
            name="Pro"
            price={1499}
            features={[
              "Up to 30 active listings",
              "Featured badge (5 listings)",
              "Top-of-search boost windows",
              "Advanced insights",
            ]}
            ctaHref="/account/billing"
          />
        </section>

        {/* FAQ */}
        <section className="mt-6 sm:mt-8 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 sm:p-6 text-[var(--text)] shadow-soft">
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-[var(--text)]">
            FAQs
          </h2>

          <div className="mt-3 space-y-3">
            <details className="group rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 sm:p-4 shadow-sm focus-within:outline-none focus-within:ring-2 ring-focus">
              <summary className="cursor-pointer text-sm sm:text-base font-medium text-[var(--text)]">
                Do I pay to post?
              </summary>
              <p className="mt-2 text-xs sm:text-sm leading-relaxed text-[var(--text-muted)]">
                You can start for free. Paid plans add visibility boosts and
                more active listings.
              </p>
            </details>

            <details className="group rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 sm:p-4 shadow-sm focus-within:outline-none focus-within:ring-2 ring-focus">
              <summary className="cursor-pointer text-sm sm:text-base font-medium text-[var(--text)]">
                Can I cancel anytime?
              </summary>
              <p className="mt-2 text-xs sm:text-sm leading-relaxed text-[var(--text-muted)]">
                Yes. Your plan remains active until the end of the billing
                period.
              </p>
            </details>

            <details className="group rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 sm:p-4 shadow-sm focus-within:outline-none focus-within:ring-2 ring-focus">
              <summary className="cursor-pointer text-sm sm:text-base font-medium text-[var(--text)]">
                Do boosts guarantee sales?
              </summary>
              <p className="mt-2 text-xs sm:text-sm leading-relaxed text-[var(--text-muted)]">
                Boosts improve visibility but don’t guarantee outcomes. Great
                photos and clear details help!
              </p>
            </details>
          </div>
        </section>
      </div>
    </main>
  );
}
