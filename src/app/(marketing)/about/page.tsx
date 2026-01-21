import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import SectionHeader from "@/app/components/SectionHeader";
import Chip from "@/app/components/Chip";
import { Button } from "@/app/components/Button";

export const metadata: Metadata = {
  title: "About QwikSale",
  description:
    "QwikSale is Kenya’s ecosystem marketplace for products, services, requests, delivery and carriers, plus trust tools built for safer local trade.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About QwikSale",
    description:
      "QwikSale is Kenya’s ecosystem marketplace for products, services, requests, delivery and carriers, plus trust tools built for safer local trade.",
    url: "/about",
    type: "website",
    images: [
      { url: "/og/og-default.jpg", width: 1200, height: 630, alt: "QwikSale" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "About QwikSale",
    description:
      "QwikSale is Kenya’s ecosystem marketplace for products, services, requests, delivery and carriers, plus trust tools built for safer local trade.",
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
      <div className="mt-1 text-xs sm:text-sm text-[var(--text-muted)]">{label}</div>
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

function PillList({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {items.map((t) => (
        <li
          key={t}
          className="chip border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px] font-semibold text-[var(--text)]"
        >
          {t}
        </li>
      ))}
    </ul>
  );
}

export default function AboutPage() {
  const values = [
    "Local first",
    "Trust and safety",
    "Simple by default",
    "Performance",
    "Transparency",
    "Community",
  ];

  const ecosystemUser = [
    "Browse listings",
    "View requests",
    "Save and share",
    "Sign in when needed",
  ];
  const ecosystemSignedIn = [
    "Post products and services",
    "Post requests",
    "Messages",
    "Dashboard",
  ];
  const ecosystemCore = [
    "Marketplace feed (products and services)",
    "Search and filters (category, subcategory, sorting)",
    "Requests feed",
    "Auth and identity",
    "Delivery layer (carrier profile plus delivery context)",
  ];
  const ecosystemOps = [
    "Admin protections",
    "Moderation and enforcement (ban and suspend carriers)",
    "Metrics and visibility",
    "Trust and safety controls",
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
      <SectionHeaderAny
        title="About QwikSale"
        subtitle="QwikSale brings together products, services, requests, delivery, and trust tools so local trade feels faster and safer."
        gradient="brand"
        className=""
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="primary">
              <Link href="/search" prefetch={false}>
                Browse
              </Link>
            </Button>
            <Button asChild size="sm" variant="primary">
              <Link href="/sell" prefetch={false}>
                + Post a listing
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/how-it-works" prefetch={false}>
                How it works
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
        <section className="grid gap-3ounds-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 text-[var(--text)] shadow-soft sm:p-6">
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-[var(--text)]">
            What QwikSale is
          </h2>
          <p className="mt-2 text-xs sm:text-sm leading-relaxed text-[var(--text-muted)]">
            QwikSale is built as a connected ecosystem. You can browse and post listings (products and services), post requests
            when you need something, request delivery with nearby carriers, and use trust signals and reporting tools to make
            safer decisions. Admin moderation supports platform integrity through enforcement and visibility controls.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/marketplace" prefetch={false} className="btn-outline">
              Marketplace
            </Link>
            <Link href="/requests" prefetch={false} className="btn-outline">
              Requests
            </Link>
            <Link href="/delivery" prefetch={false} className="btn-outline">
              Delivery
            </Link>
            <Link href="/carrier" prefetch={false} className="btn-outline">
              Carrier
            </Link>
            <Link href="/trust" prefetch={false} className="btn-outline">
              Trust
            </Link>
            <Link href="/safety" prefetch={false} className="btn-outline">
              Safety
            </Link>
          </div>
        </section>

        <section className="mt-6 sm:mt-8 grid gap-3 sm:gap-4 md:grid-cols-3">
          <Feature
            title="Local first"
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M12 2C8.1 2 5 5.1 5 9c0 5.3 7 13 7 13s7-7.7 7-13c0-3.9-3.1-7-7-7zm0 9.5c-1.4 0-2.5-1.1-2.5-2.5S10.6 6.5 12 6.5s2.5 1.1 2.5 2.5S13.4 11.5 12 11.5z" />
              </svg>
            }
          >
            Designed for Kenyan cities and towns with categories, filters, and a marketplace that supports both products and services.
          </Feature>
          <Feature
            title="Fast and clear journeys"
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M3 6h18v2H3V6zm4 5h14v2H7v-2zm-4 5h18v2H3v-2z" />
              </svg>
            }
          >
            Browse, request, deliver, and message without heavy checkout friction. URLs stay source of truth and pages stay stable.
          </Feature>
          <Feature
            title="Trust and moderation"
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M12 2l7 4v6c0 5-3.4 9.7-7 10-3.6-.3-7-5-7-10V6l7-4z" />
              </svg>
            }
          >
            Reporting, verification signals, reviews, and admin enforcement help keep the platform safer for everyone.
          </Feature>
        </section>

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

        <section
          className="mt-6 sm:mt-8 grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4"
          aria-label="High-level stats"
        >
          <Stat label="Marketplace scope" value="Products + Services" sublabel="one search experience" />
          <Stat label="Requests and delivery" value="Ecosystem" sublabel="buyers, sellers, carriers" />
          <Stat label="Avg. time to post" value="≤ 3 min" sublabel="with photos and location" />
          <Stat label="Trust tools" value="Verified + Report" sublabel="reviews + moderation signals" />
        </section>

        <section className="mt-6 sm:mt-8 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 sm:p-6 text-[var(--text)] shadow-soft">
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-[var(--text)]">
            Ecosystem overview
          </h2>
          <p className="mt-2 text-xs sm:text-sm leading-relaxed text-[var(--text-muted)]">
            The platform is designed as connected layers. Guests can browse and discover, signed in users can post and message,
            delivery is powered by carrier profiles, and admin tools enforce safety and integrity.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                User experience
              </div>
              <div className="mt-2 text-sm font-semibold text-[var(--text)]">Guests</div>
              <PillList items={ecosystemUser} />
              <div className="mt-4 text-sm font-semibold text-[var(--text)]">Signed in</div>
              <PillList items={ecosystemSignedIn} />
            </div>

            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Core platform
              </div>
              <PillList items={ecosystemCore} />
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/search" prefetch={false} className="btn-outline text-sm">
                  Search
                </Link>
                <Link href="/requests" prefetch={false} className="btn-outline text-sm">
                  Requests
                </Link>
                <Link href="/delivery" prefetch={false} className="btn-outline text-sm">
                  Delivery
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Operations & admin
              </div>
              <PillList items={ecosystemOps} />
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/trust" prefetch={false} className="btn-outline text-sm">
                  Trust
                </Link>
                <Link href="/safety" prefetch={false} className="btn-outline text-sm">
                  Safety
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 sm:mt-8 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 sm:p-6 text-[var(--text)] shadow-soft">
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-[var(--text)]">
            Our story
          </h2>
          <p className="mt-2 text-xs sm:text-sm leading-relaxed text-[var(--text-muted)]">
            QwikSale started as a simple local marketplace. Over time, we expanded into an ecosystem so buyers and sellers can
            complete more of the journey in one place. Discover listings, post requests, coordinate delivery, and use trust signals
            and reporting tools for safer outcomes. Speed, clarity, and community safety remain the focus.
          </p>
        </section>

        <section className="mt-6 sm:mt-8">
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-[var(--text)]">
            Milestones
          </h2>
          <ol className="mt-3 space-y-3 border-l border-[var(--border-subtle)] pl-3">
            <TimelineItem year="2023" title="Prototype & first marketplace loop">
              We tested the core browse, open, and contact journey and improved speed and clarity.
            </TimelineItem>
            <TimelineItem year="2024" title="Requests + trust tools">
              Added buyer requests, verification signals, and reporting flows to reduce scams and friction.
            </TimelineItem>
            <TimelineItem year="2025" title="Delivery ecosystem + enforcement">
              Introduced carrier profiles, delivery routing, and stronger admin moderation and enforcement controls.
            </TimelineItem>
          </ol>
        </section>

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

        <section className="mt-6 sm:mt-8">
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-[var(--text)]">
            FAQs
          </h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <FAQItem
              q="Is QwikSale free to use?"
              a="Browsing and posting basic listings are free. Optional boosts or upgrades may exist in limited cases; details are always shown before you pay."
            />
            <FAQItem
              q="What’s the difference between listings and requests?"
              a={
                <>
                  Listings are what sellers offer (products and services). Requests are what buyers need. You can browse both from{" "}
                  <Link href="/search" prefetch={false} className="underline">
                    Search
                  </Link>{" "}
                  and{" "}
                  <Link href="/requests" prefetch={false} className="underline">
                    Requests
                  </Link>
                  .
                </>
              }
            />
            <FAQItem
              q="How does delivery work?"
              a={
                <>
                  Delivery is powered by carrier profiles. Product and service pages can deep link into{" "}
                  <Link href="/delivery" prefetch={false} className="underline">
                    Delivery
                  </Link>{" "}
                  with store and product context. Carriers can be moderated (ban and suspend) to protect the ecosystem.
                </>
              }
            />
            <FAQItem
              q="How do I contact support?"
              a={
                <>
                  Reach us via{" "}
                  <Link href="/contact" prefetch={false} className="underline">
                    /contact
                  </Link>{" "}
                  or review{" "}
                  <Link href="/help" prefetch={false} className="underline">
                    Help Center
                  </Link>{" "}
                  for common flows.
                </>
              }
            />
          </div>
        </section>

        <section className="mt-8 sm:mt-10 flex flex-col items-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 sm:p-6 text-center text-[var(--text)] shadow-soft">
          <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text)]">
            Join the ecosystem
          </h2>
          <p className="mt-1 text-xs sm:text-sm leading-relaxed text-[var(--text-muted)]">
            Browse listings, post a request, or earn with delivery, all connected by trust signals.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Button asChild size="md" variant="primary">
              <Link href="/search" prefetch={false}>
                Browse marketplace
              </Link>
            </Button>
            <Button asChild size="md" variant="primary">
              <Link href="/sell" prefetch={false}>
                + Post a listing
              </Link>
            </Button>
            <Button asChild size="md" variant="outline">
              <Link href="/requests" prefetch={false}>
                Post a request
              </Link>
            </Button>
            <Button asChild size="md" variant="outline">
              <Link href="/carrier" prefetch={false}>
                Become a carrier
              </Link>
            </Button>
          </div>
        </section>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </main>
  );
}
