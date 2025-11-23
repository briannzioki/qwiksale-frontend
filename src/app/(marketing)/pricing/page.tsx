// src/app/(marketing)/pricing/page.tsx
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
        "flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 text-[var(--text)] shadow-soft",
        highlight ? "ring-2 ring-[#39a0ca]" : "",
      ].join(" ")}
    >
      <div className="mb-2 text-sm uppercase tracking-wide text-[var(--text-muted)]">
        {name}
      </div>
      <div className="flex items-end gap-1">
        <div className="text-3xl font-extrabold text-[var(--text)]">
          {fmtKES(price)}
        </div>
        <div className="pb-1 text-xs text-[var(--text-muted)]">
          /{period}
        </div>
      </div>

      <ul className="mt-4 space-y-2 text-sm text-[var(--text-muted)]">
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
          "mt-6 inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 ring-focus",
          highlight
            ? "bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] text-white hover:opacity-95"
            : "border border-[var(--border-subtle)] text-[var(--text)] hover:bg-subtle",
        ].join(" ")}
        aria-label={`Choose ${name}`}
        prefetch={false}
      >
        {highlight ? "Get started" : "Choose plan"}
      </Link>
    </div>
  );
}

export default function PricingPage() {
  return (
    <main className="container-page py-8 text-[var(--text)]">
      <SectionHeader
        title="Pricing"
        subtitle="Start free. Upgrade when you’re ready for more visibility."
        className="bg-spotlight brand-noise"
      />
      <ul className="mt-3 flex flex-wrap gap-2">
        <li className="chip-outline">No contracts</li>
        <li className="chip-outline">Cancel anytime</li>
        <li className="chip-outline">M-Pesa ready</li>
      </ul>

      {/* Plans */}
      <section className="mt-6 grid gap-4 md:grid-cols-3">
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
      <section className="mt-8 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 text-[var(--text)] shadow-soft">
        <h2 className="text-lg font-semibold">FAQs</h2>
        <div className="mt-3 space-y-3">
          <details className="group rounded-lg border border-[var(--border-subtle)] bg-subtle p-4">
            <summary className="cursor-pointer font-medium text-[var(--text)]">
              Do I pay to post?
            </summary>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              You can start for free. Paid plans add visibility boosts and more
              active listings.
            </p>
          </details>
          <details className="group rounded-lg border border-[var(--border-subtle)] bg-subtle p-4">
            <summary className="cursor-pointer font-medium text-[var(--text)]">
              Can I cancel anytime?
            </summary>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Yes. Your plan remains active until the end of the billing period.
            </p>
          </details>
          <details className="group rounded-lg border border-[var(--border-subtle)] bg-subtle p-4">
            <summary className="cursor-pointer font-medium text-[var(--text)]">
              Do boosts guarantee sales?
            </summary>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Boosts improve visibility but don’t guarantee outcomes. Great
              photos and clear details help!
            </p>
          </details>
        </div>
      </section>
    </main>
  );
}
