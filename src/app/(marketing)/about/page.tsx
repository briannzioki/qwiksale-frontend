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
    images: [{ url: "/og/og-default.jpg", width: 1200, height: 630, alt: "QwikSale" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "About QwikSale",
    description: "Our mission, values, and the team behind QwikSale.",
    images: ["/og/og-default.jpg"],
  },
};

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
    <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        {icon ? <div className="text-brandBlue-600" aria-hidden>{icon}</div> : null}
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-slate-100">{title}</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">{children}</p>
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
    <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 text-center">
      <div className="text-2xl font-extrabold text-gray-900 dark:text-slate-100">{value}</div>
      <div className="mt-1 text-sm text-gray-600 dark:text-slate-300">{label}</div>
      {sublabel ? <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">{sublabel}</div> : null}
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
      <span className="absolute left-0 top-1.5 h-3 w-3 rounded-full bg-brandBlue-600" aria-hidden />
      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">{year}</div>
      <h3 className="font-semibold text-gray-900 dark:text-slate-100">{title}</h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">{children}</p>
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
    <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center gap-3">
        <div className="relative h-12 w-12 overflow-hidden rounded-full bg-gradient-to-br from-brandNavy/20 to-brandBlue/20">
          {imageSrc ? (
            <Image src={imageSrc} alt={`${name} headshot`} fill className="object-cover" sizes="48px" />
          ) : (
            <span className="grid h-full w-full place-items-center text-sm font-semibold text-gray-700 dark:text-slate-200">
              {name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
            </span>
          )}
        </div>
        <div>
          <div className="font-medium text-gray-900 dark:text-slate-100">{name}</div>
          <div className="text-sm text-gray-600 dark:text-slate-300">{role}</div>
        </div>
      </div>
    </div>
  );
}

function FAQItem({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <details className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-900 p-4">
      <summary className="cursor-pointer list-none font-medium text-gray-900 dark:text-slate-100">
        {q}
      </summary>
      <div className="mt-2 text-sm text-gray-600 dark:text-slate-300">{a}</div>
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
    <main className="min-h-dvh">
      {/* Hero */}
      <SectionHeader
        title="About QwikSale"
        subtitle="A faster, safer way to buy & sell locally."
        gradient="brand"
        className=""
        actions={
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="primary">
              <Link href="/sell" prefetch={false}>+ Post a listing</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/contact" prefetch={false}>Contact us</Link>
            </Button>
          </div>
        }
      />

      <div className="container-page py-8 md:py-10">
        {/* Intro block */}
        <section className="grid gap-4 md:grid-cols-3">
          <Feature
            title="Local-first"
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M12 2C8.1 2 5 5.1 5 9c0 5.3 7 13 7 13s7-7.7 7-13c0-3.9-3.1-7-7-7zm0 9.5c-1.4 0-2.5-1.1-2.5-2.5S10.6 6.5 12 6.5s2.5 1.1 2.5 2.5S13.4 11.5 12 11.5z"/>
              </svg>
            }
          >
            Designed for your city with categories, filters, and trust features that make meetups easy.
          </Feature>
          <Feature
            title="Simple & fast"
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M3 6h18v2H3V6zm4 5h14v2H7v-2zm-4 5h18v2H3v-2z"/>
              </svg>
            }
          >
            Post in minutes. Clear photos, smart defaults, and a clean checkout-free flow.
          </Feature>
          <Feature
            title="Community safety"
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M12 2l7 4v6c0 5-3.4 9.7-7 10-3.6-.3-7-5-7-10V6l7-4z"/>
              </svg>
            }
          >
            Reporting tools and moderation keep the marketplace healthy for everyone.
          </Feature>
        </section>

        {/* Values chips */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Our values</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {values.map((v) => (
              <Chip key={v} dense className="bg-white/80 dark:bg-transparent border-gray-200 dark:border-white/10">
                {v}
              </Chip>
            ))}
          </div>
        </section>

        {/* Stats */}
        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="High-level stats">
          <Stat label="Active categories" value="20+" />
          <Stat label="Avg. time to post" value="â‰¤ 3 min" />
          <Stat label="Cities covered" value="30+" />
          <Stat label="Median response time" value="&lt; 1 hr" sublabel="for top listings" />
        </section>

        {/* Story */}
        <section className="mt-8 rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Our story</h2>
          <p className="mt-2 text-sm text-gray-700 dark:text-slate-300">
            QwikSale started with a simple idea: local marketplaces should feel modern, lightweight,
            and trustworthy. Weâ€™re building tools that help real people find great deals nearbyâ€”without
            friction. From an initial prototype shared with friends to a platform powering thousands of
            listings, our focus hasnâ€™t changed: speed, clarity, and community safety.
          </p>
        </section>

        {/* Timeline */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Milestones</h2>
          <ol className="mt-3 space-y-3 border-l border-gray-200 dark:border-white/10 pl-3">
            <TimelineItem year="2023" title="Prototype & first listings">
              We tested our ideas in one city and iterated quickly with seller feedback.
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
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Team</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TeamCard name="Alex Kimani" role="Co-founder â€¢ Product" />
            <TeamCard name="Joy Wanjiru" role="Co-founder â€¢ Engineering" />
            <TeamCard name="Sam Otieno" role="Design & Research" />
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">FAQs</h2>
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
              a="Weâ€™re expanding steadily. You can browse and post in most major towns, with more coming soon."
            />
            <FAQItem
              q="How do I contact support?"
              a={
                <>
                  Reach us via the <Link href="/contact" className="underline">contact form</Link> or email{" "}
                  <a href="mailto:support@qwiksale.app" className="underline">support@qwiksale.app</a>.
                </>
              }
            />
          </div>
        </section>

        {/* CTA */}
        <section className="mt-10 flex flex-col items-center rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-900 p-6 text-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">Join the community</h2>
          <p className="mt-1 text-sm text-gray-700 dark:text-slate-300">
            Post your first listing in minutes, or find great deals near you.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Button asChild size="md" variant="primary">
              <Link href="/sell" prefetch={false}>+ Post a listing</Link>
            </Button>
            <Button asChild size="md" variant="outline">
              <Link href="/search" prefetch={false}>Browse all</Link>
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

