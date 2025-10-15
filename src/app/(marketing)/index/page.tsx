// src/app/(marketing)/index/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import SectionHeader from "@/app/components/SectionHeader";
import { Button } from "@/app/components/Button";

export const metadata: Metadata = {
  title: "QwikSale — Buy & Sell Locally, Fast",
  description:
    "Post in minutes, find great deals nearby, and meet safely. QwikSale is the faster, cleaner local marketplace.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  openGraph: {
    title: "QwikSale — Buy & Sell Locally, Fast",
    description:
      "Post in minutes, find great deals nearby, and meet safely. QwikSale is the faster, cleaner local marketplace.",
    url: "/",
    type: "website",
    images: [{ url: "/og/og-default.jpg", width: 1200, height: 630, alt: "QwikSale" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "QwikSale — Buy & Sell Locally, Fast",
    description:
      "Post in minutes, find great deals nearby, and meet safely. QwikSale is the faster, cleaner local marketplace.",
    images: ["/og/og-default.jpg"],
  },
};

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
    <div className="rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="text-2xl font-extrabold text-gray-900 dark:text-slate-100">{value}</div>
      <div className="mt-1 text-sm text-gray-600 dark:text-slate-300">{label}</div>
      {sublabel ? (
        <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">{sublabel}</div>
      ) : null}
    </div>
  );
}

function Step({
  num,
  title,
  children,
}: {
  num: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card-surface p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-brandBlue-600/10 text-brandBlue-700 dark:bg-brandBlue-600/15 dark:text-brandBlue-300">
          <span className="text-sm font-bold">{num}</span>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-slate-100">{title}</h3>
          <p className="mt-1 text-sm text-gray-700 dark:text-slate-300">{children}</p>
        </div>
      </div>
    </div>
  );
}

function Testimonial({
  quote,
  author,
  meta,
}: {
  quote: string;
  author: string;
  meta?: string;
}) {
  return (
    <figure className="card-surface p-5">
      <blockquote className="text-sm text-gray-800 dark:text-slate-200">“{quote}”</blockquote>
      <figcaption className="mt-2 text-xs text-gray-500 dark:text-slate-400">
        — <span className="font-medium text-gray-800 dark:text-slate-200">{author}</span>
        {meta ? `, ${meta}` : null}
      </figcaption>
    </figure>
  );
}

export default function MarketingHome() {
  const categories = [
    { label: "Phones & Tablets", href: "/search?category=phones" },
    { label: "Laptops & Computers", href: "/search?category=computers" },
    { label: "TV & Audio", href: "/search?category=tv-audio" },
    { label: "Home & Furniture", href: "/search?category=home" },
    { label: "Vehicles", href: "/search?category=vehicles" },
    { label: "Fashion", href: "/search?category=fashion" },
    { label: "Appliances", href: "/search?category=appliances" },
    { label: "Services", href: "/search?category=services" },
  ];

  const features = [
    "Local-first",
    "Verified profiles",
    "In-app messaging",
    "Photo-first listings",
    "Smart search & filters",
    "No buyer fees",
  ];

  const faqs = [
    {
      q: "Is QwikSale free?",
      a: "Browsing and posting basic listings are free. Optional boosts may be available for more visibility.",
    },
    {
      q: "Do you handle payments?",
      a: "No — QwikSale connects local buyers and sellers. We provide guidance for safe in-person meetups.",
    },
    {
      q: "How do I get more views?",
      a: "Use clear photos, set a fair price, and respond quickly. You can also upgrade to boost visibility.",
    },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "QwikSale",
    url: process.env["NEXT_PUBLIC_APP_URL"] || "https://qwiksale.app",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate:
          (process.env["NEXT_PUBLIC_APP_URL"] || "https://qwiksale.app") + "/search?q={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <main className="min-h-dvh">
      {/* Hero / Section header with lighter spacing */}
      <SectionHeader
        title="Buy & sell locally — fast."
        subtitle="Post in minutes. Chat in app. Meet safely. The local marketplace that respects your time."
        gradient="brand"
        className="bg-spotlight brand-noise"
        actions={
          <div className="flex items-center gap-2">
            <Button asChild size="md" variant="primary">
              <Link href="/sell" prefetch={false}>+ Post a listing</Link>
            </Button>
            <Button asChild size="md" variant="outline">
              <Link href="/search" prefetch={false}>Browse deals</Link>
            </Button>
          </div>
        }
      />
      <ul className="mt-3 flex flex-wrap gap-2">
        <li className="chip-outline">Verified profiles</li>
        <li className="chip-outline">In-app messaging</li>
        <li className="chip-outline">M-Pesa friendly</li>
        <li className="chip-outline">No buyer fees</li>
      </ul>

      {/* Body */}
      <div className="container-page py-8 md:py-10">
        {/* Quick stats */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Platform stats">
          <Stat label="Active categories" value="20+" />
          <Stat label="Cities covered" value="30+" />
          <Stat label="Avg. time to post" value="≤ 3 min" />
          <Stat label="Median response time" value="< 1 hr" sublabel="top listings" />
        </section>

        {/* Popular categories */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Popular categories</h2>
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Category quick filters">
            {categories.map((c) => (
              <li key={c.label}>
                <Link href={c.href} className="chip-outline">
                  {c.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Why QwikSale */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Why QwikSale</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <div className="card-surface p-5">
              <h3 className="font-semibold">Faster posting</h3>
              <p className="mt-1 text-sm text-gray-700 dark:text-slate-300">
                Clean forms, photo-first flow, and smart defaults so you can list in minutes.
              </p>
            </div>
            <div className="card-surface p-5">
              <h3 className="font-semibold">Smarter search</h3>
              <p className="mt-1 text-sm text-gray-700 dark:text-slate-300">
                Powerful filters and helpful suggestions to find exactly what you need nearby.
              </p>
            </div>
            <div className="card-surface p-5">
              <h3 className="font-semibold">Safety built-in</h3>
              <p className="mt-1 text-sm text-gray-700 dark:text-slate-300">
                Verified profiles, reporting tools, and clear safety guidelines for every meetup.
              </p>
            </div>
          </div>

          <ul className="mt-3 flex flex-wrap gap-2">
            {features.map((f) => (
              <li key={f} className="chip-outline">{f}</li>
            ))}
          </ul>
        </section>

        {/* How it works */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">How it works</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <Step num={1} title="Post">
              Snap a few photos, add a price and short description. Publish instantly.
            </Step>
            <Step num={2} title="Chat">
              Reply to buyers in-app. Share meet-up details without exposing your number.
            </Step>
            <Step num={3} title="Meet & pay">
              Meet in public. Inspect the item, then pay via cash or M-Pesa.
            </Step>
          </div>
          <div className="mt-4">
            <Link
              href="/safety"
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-gray-50 dark:border-white/10 dark:hover:bg-slate-800"
            >
              Read safety tips
              <span aria-hidden>→</span>
            </Link>
          </div>
        </section>

        {/* Social proof */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Loved by locals</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <Testimonial
              quote="Listed my phone at lunch, got 4 messages by evening, sold the next day."
              author="Brian M."
              meta="Nairobi"
            />
            <Testimonial
              quote="Filters are spot on. Found a TV in my estate and picked it up same day."
              author="Shiro K."
              meta="Thika"
            />
            <Testimonial
              quote="The meet-up tips are clutch. Felt safer and more confident selling my laptop."
              author="Peter O."
              meta="Eldoret"
            />
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">FAQs</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {faqs.map((f) => (
              <details key={f.q} className="card-surface p-4">
                <summary className="cursor-pointer list-none font-medium text-gray-900 dark:text-slate-100">
                  {f.q}
                </summary>
                <p className="mt-2 text-sm text-gray-700 dark:text-slate-300">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mt-12 flex flex-col items-center rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-white/10 dark:bg-slate-900">
          <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">Ready to try QwikSale?</h2>
          <p className="mt-1 text-sm text-gray-700 dark:text-slate-300">
            Post your first listing in minutes or browse deals near you.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Button asChild size="md" variant="primary">
              <Link href="/sell" prefetch={false}>+ Post a listing</Link>
            </Button>
            <Button asChild size="md" variant="outline">
              <Link href="/search" prefetch={false}>Browse all</Link>
            </Button>
          </div>
          <ul className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <li className="chip-outline">Free to start</li>
            <li className="chip-outline">Local only</li>
            <li className="chip-outline">Community-safe</li>
          </ul>
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
