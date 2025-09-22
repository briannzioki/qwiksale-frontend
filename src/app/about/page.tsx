// src/app/about/page.tsx
export const dynamic = "force-static";
export const revalidate = 3600;

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About | QwikSale",
  description:
    "QwikSale is a Kenyan marketplace built for simplicity, safety, and speed. Learn our mission, values, and how we support local buyers and sellers.",
  alternates: { canonical: "/about" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "About QwikSale",
    description: "A Kenyan marketplace focused on simplicity, safety, and speed.",
    url: "/about",
    siteName: "QwikSale",
    type: "website",
    locale: "en_KE",
    images: [{ url: "/og/about.png", width: 1200, height: 630, alt: "About QwikSale" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "About QwikSale",
    description: "A Kenyan marketplace focused on simplicity, safety, and speed.",
    images: ["/og/about.png"],
  },
};

export default function AboutPage() {
  return (
    <main className="container-page py-8">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "QwikSale",
            url: "https://qwiksale.sale",
            email: "hello@qwiksale.sale",
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "What is QwikSale?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "A Kenyan marketplace that helps buyers and sellers trade quickly and safely with local-first tools.",
                },
              },
              {
                "@type": "Question",
                name: "How do sellers stand out?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Use Gold or Platinum tiers to boost placement and add verified seller badges.",
                },
              },
              {
                "@type": "Question",
                name: "Is QwikSale built for Kenya?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Yes—pricing, flows, and contact options are tuned for Kenyan buyers and M-Pesa habits.",
                },
              },
            ],
          }),
        }}
      />

      <article className="prose dark:prose-invert max-w-3xl">
        <header>
          <h1>About QwikSale</h1>
          <p className="lead">
            QwikSale is a Kenyan marketplace focused on <strong>simplicity</strong>,{" "}
            <strong>safety</strong>, and <strong>speed</strong>.
          </p>
        </header>

        <section>
          <h2>Our mission</h2>
          <p>
            Make everyday trading fast and trustworthy for everyone in Kenya—from first-time
            sellers to established businesses—using clear tools and dependable protections.
          </p>
        </section>

        <section>
          <h2>What we value</h2>
          <ul>
            <li>
              <strong>Safety first.</strong> Anti-fraud checks, verified sellers, and reporting.
            </li>
            <li>
              <strong>Local by design.</strong> Built around M-Pesa, local pricing, and Kenyan buyer behavior.
            </li>
            <li>
              <strong>Less friction.</strong> Quick listing flow, clean search, no noise.
            </li>
          </ul>
        </section>

        <section>
          <h2>How QwikSale helps</h2>
          <ul>
            <li>Simple listing creation with photos and categories.</li>
            <li>Seller profiles (username, WhatsApp contact, store page).</li>
            <li>Featured tiers (Gold/Platinum) for more reach when needed.</li>
            <li>Fast search and relevant filters.</li>
          </ul>
        </section>

        <section>
          <h2>Policies &amp; support</h2>
          <p>
            Read our <Link href="/terms">Terms of Service</Link> and{" "}
            <Link href="/privacy">Privacy Policy</Link>. Need help?{" "}
            <Link href="/support">Contact support</Link>.
          </p>
        </section>

        <section>
          <h2>Work with us</h2>
          <p>
            Feedback or partnership ideas? Email{" "}
            <a href="mailto:hello@qwiksale.sale">hello@qwiksale.sale</a>.
          </p>
        </section>

        {/* CTAs */}
        <section aria-label="Get started" className="not-prose mt-8">
          <div className="flex flex-wrap gap-3">
            <Link href="/signin" className="btn-gradient-primary">
              Sign in
            </Link>
            <Link href="/dashboard" className="btn-outline">
              Create a listing
            </Link>
            <Link href="/search" className="btn-outline">
              Browse categories
            </Link>
          </div>
        </section>

        <footer>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            © {new Date().getFullYear()} QwikSale. Built in Kenya.
          </p>
        </footer>
      </article>
    </main>
  );
}
