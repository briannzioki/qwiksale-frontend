// src/app/(marketing)/about/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import SectionHeader from "@/app/components/SectionHeader";
import Chip from "@/app/components/Chip";
import { Button } from "@/app/components/Button";

export const metadata: Metadata = {
  title: "About QwikSale",
  description: "Our mission, values, and the team behind QwikSale.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About QwikSale",
    description: "Our mission, values, and the team behind QwikSale.",
    url: "/about",
    type: "website",
    images: [
      { url: "/og/og-default.jpg", width: 1200, height: 630, alt: "QwikSale" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "About QwikSale",
    description: "Our mission, values, and the team behind QwikSale.",
    images: ["/og/og-default.jpg"],
  },
};

const SectionHeaderAny = SectionHeader as any;

function Feature({
  title,
  children,
  icon,
}: {
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-5 text-[var(--text)] shadow-soft">
      <div className="flex items-start gap-3">
        {icon ? (
          <div className="text-[var(--text)] opacity-90" aria-hidden>
            {icon}
          </div>
        ) : null}
        <div>
          <h3 className="text-sm sm:text-base font-semibold tracking-tight text-[var(--text)]">
            {title}
          </h3>
          <p className="mt-1 text-xs sm:text-sm leading-relaxed text-[var(--text-muted)]">
            {children}
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-5 text-center text-[var(--text)] shadow-soft">
      <div className="text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text)]">
        {value}
      </div>
      <div className="mt-1 text-xs sm:text-sm text-[var(--text-muted)]">
        {label}
      </div>
      {sublabel ? (
        <div className="mt-1 text-[11px] sm:text-xs text-[var(--text-muted)]">
          {sublabel}
        </div>
      ) : null}
    </div>
  );
}

function TimelineItem({
  year,
  title,
  children,
}: {
  year: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="relative pl-6">
      <span
        className="absolute left-0 top-1.5 h-3 w-3 rounded-full bg-[var(--text)] opacity-70"
        aria-hidden
      />
      <div className="text-[11px] sm:text-xs uppercase tracking-wide text-[var(--text-muted)]">
        {year}
      </div>
      <h3 className="text-sm sm:text-base font-semibold tracking-tight text-[var(--text)]">
        {title}
      </h3>
      <p className="mt-1 text-xs sm:text-sm leading-relaxed text-[var(--text-muted)]">
        {children}
      </p>
    </li>
  );
}

function TeamCard({
  name,
  role,
  imageSrc,
}: {
  name: string;
  role: string;
  imageSrc?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-4 text-[var(--text)] shadow-soft">
      <div className="flex items-center gap-3">
        <div className="relative h-10 w-10 sm:h-12 sm:w-12 overflow-hidden rounded-full bg-[var(--bg-subtle)] ring-1 ring-[var(--border-subtle)]">
          {imageSrc ? (
            <Image
              src={imageSrc}
              alt={`${name} headshot`}
              fill
              className="object-cover"
              sizes="48px"
            />
          ) : (
            <span className="grid h-full w-full place-items-center text-sm font-semibold text-[var(--text)]">
              {name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </span>
          )}
        </div>
        <div>
          <div className="text-sm sm:text-base font-medium text-[var(--text)]">
            {name}
          </div>
          <div className="text-xs sm:text-sm text-[var(--text-muted)]">
            {role}
          </div>
        </div>
      </div>
    </div>
  );
}

function FAQItem({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <details className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-4 text-[var(--text)] shadow-soft focus-within:outline-none focus-within:ring-2 ring-focus">
      <summary className="cursor-pointer list-none text-sm sm:text-base font-medium text-[var(--text)]">
        {q}
      </summary>
      <div className="mt-2 text-xs sm:text-sm leading-relaxed text-[var(--text-muted)]">
        {a}
      </div>
    </details>
  );
}

export default function AboutPage() {
  const values = [
    "Local-first",
    "Trust & safety",
    "Simple by default",
    "Performance",
    "Transparency",
    "Community",
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "QwikSale",
    url: process.env["NEXT_PUBLIC_APP_URL"] || "https://qwiksale.app",
    logo: "/logo.svg",
    sameAs: [
      "https://x.com/qwiksale",
      "https://www.facebook.com/qwiksale",
      "https://www.instagram.com/qwiksale",
    ],
  };

  return (
    <main className="min-h-dvh bg-[var(--bg)] text-[var(--text)]">
      {/* Hero */}
      <SectionHeaderAny
        title="About QwikSale"
        subtitle="A faster, safer way to buy & sell locally."
        gradient="brand"
        className=""
        actions={
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="primary">
              <Link href="/sell" prefetch={false}>
                + Post a listing
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/contact" prefetch={false}>
                Contact us
              </Link>
            </Button>
          </div>
        }
      />

      <div className="container-page py-4 sm:py-6 md:py-10">
        {/* Intro block */}
        <section className="grid gap-3 sm:gap-4 md:grid-cols-3">
          <Feature
            title="Local-first"
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M12 2C8.1 2 5 5.1 5 9c0 5.3 7 13 7 13s7-7.7 7-13c0-3.9-3.1-7-7-7zm0 9.5c-1.4 0-2.5-1.1-2.5-2.5S10.6 6.5 12 6.5s2.5 1.1 2.5 2.5S13.4 11.5 12 11.5z" />
              </svg>
            }
          >
            Designed for your city with categories, filters, and trust features
            that make meetups easy.
          </Feature>
          <Feature
            title="Simple & fast"
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M3 6h18v2H3V6zm4 5h14v2H7v-2zm-4 5h18v2H3v-2z" />
              </svg>
            }
          >
            Post in minutes. Clear photos, smart defaults, and a clean
            checkout-free flow.
          </Feature>
          <Feature
            title="Community safety"
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M12 2l7 4v6c0 5-3.4 9.7-7 10-3.6-.3-7-5-7-10V6l7-4z" />
              </svg>
            }
          >
            Reporting tools and moderation keep the marketplace healthy for
            everyone.
          </Feature>
        </section>

        {/* Values chips */}
        <section className="mt-6 sm:mt-8">
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-[var(--text)]">
            Our values
          </h2>
          <div className="mt-3 flex gap-2 overflow-x-auto whitespace-nowrap [-webkit-overflow-scrolling:touch] pb-1 sm:flex-wrap sm:overflow-visible sm:whitespace-normal">
            {values.map((v) => (
              <Chip
                key={v}
                dense
                className="bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text)]"
              >
                {v}
              </Chip>
            ))}
          </div>
        </section>

        {/* Stats */}
        <section
          className="mt-6 sm:mt-8 grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4"
          aria-label="High-level stats"
        >
          <Stat label="Active categories" value="20+" />
          <Stat label="Avg. time to post" value="≤ 3 min" />
          <Stat label="Cities covered" value="30+" />
          <Stat
            label="Median response time"
            value="&lt; 1 hr"
            sublabel="for top listings"
          />
        </section>

        {/* Story */}
        <section className="mt-6 sm:mt-8 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 sm:p-6 text-[var(--text)] shadow-soft">
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-[var(--text)]">
            Our story
          </h2>
          <p className="mt-2 text-xs sm:text-sm leading-relaxed text-[var(--text-muted)]">
            QwikSale started with a simple idea: local marketplaces should feel
            modern, lightweight, and trustworthy. We’re building tools that help
            real people find great deals nearby - without friction. From an
            initial prototype shared with friends to a platform powering
            thousands of listings, our focus hasn’t changed: speed, clarity, and
            community safety.
          </p>
        </section>

        {/* Timeline */}
        <section className="mt-6 sm:mt-8">
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-[var(--text)]">
            Milestones
          </h2>
          <ol className="mt-3 space-y-3 border-l border-[var(--border-subtle)] pl-3">
            <TimelineItem year="2023" title="Prototype & first listings">
              We tested our ideas in one city and iterated quickly with seller
              feedback.
            </TimelineItem>
            <TimelineItem year="2024" title="Trust & safety features">
              Added reporting, verified badges, and better moderation signals.
            </TimelineItem>
            <TimelineItem year="2025" title="Scaling to more cities">
              Performance upgrades, improved mobile UX, and smarter search.
            </TimelineItem>
          </ol>
        </section>

        {/* Team */}
        <section className="mt-6 sm:mt-8">
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-[var(--text)]">
            Team
          </h2>
          <div className="mt-3 grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TeamCard name="Alex Kimani" role="Co-founder • Product" />
            <TeamCard name="Joy Wanjiru" role="Co-founder • Engineering" />
            <TeamCard name="Sam Otieno" role="Design & Research" />
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-6 sm:mt-8">
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-[var(--text)]">
            FAQs
          </h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <FAQItem
              q="Is QwikSale free to use?"
              a="Yes. Browsing and posting basic listings are free. Optional boosts may be offered in the future."
            />
            <FAQItem
              q="How do you keep buyers and sellers safe?"
              a="We provide reporting tools, verified badges, and guidance for safe meetups. Suspicious content is reviewed."
            />
            <FAQItem
              q="Which cities are supported?"
              a="We’re expanding steadily. You can browse and post in most major towns, with more coming soon."
            />
            <FAQItem
              q="How do I contact support?"
              a={
                <>
                  Reach us via the{" "}
                  <Link href="/contact" className="underline">
                    contact form
                  </Link>{" "}
                  or email{" "}
                  <a href="mailto:support@qwiksale.app" className="underline">
                    support@qwiksale.app
                  </a>
                  .
                </>
              }
            />
          </div>
        </section>

        {/* CTA */}
        <section className="mt-8 sm:mt-10 flex flex-col items-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 sm:p-6 text-center text-[var(--text)] shadow-soft">
          <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text)]">
            Join the community
          </h2>
          <p className="mt-1 text-xs sm:text-sm leading-relaxed text-[var(--text-muted)]">
            Post your first listing in minutes, or find great deals near you.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Button asChild size="md" variant="primary">
              <Link href="/sell" prefetch={false}>
                + Post a listing
              </Link>
            </Button>
            <Button asChild size="md" variant="outline">
              <Link href="/search" prefetch={false}>
                Browse all
              </Link>
            </Button>
          </div>
        </section>
      </div>

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </main>
  );
}
