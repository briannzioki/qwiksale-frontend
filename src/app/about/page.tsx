// src/app/about/page.tsx
export const dynamic = "force-static"; // safe to cache
export const revalidate = 3600;        // re-gen hourly

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About | QwikSale",
  description:
    "QwikSale is a Kenyan marketplace built for simplicity, safety, and speed. Learn our mission, values, and how we support local buyers and sellers.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About QwikSale",
    description:
      "A Kenyan marketplace focused on simplicity, safety, and speed.",
    url: "/about",
    siteName: "QwikSale",
    type: "website",
  },
};

export default function AboutPage() {
  return (
    <main className="container-page py-8">
      <article className="prose dark:prose-invert max-w-3xl">
        <header>
          <h1>About QwikSale</h1>
          <p className="lead">
            QwikSale is a Kenyan marketplace focused on <strong>simplicity</strong>,{" "}
            <strong>safety</strong>, and <strong>speed</strong>. We connect buyers and
            sellers with modern tools, fair policies, and local support.
          </p>
        </header>

        <section>
          <h2>Our mission</h2>
          <p>
            Make everyday trading fast and trustworthy for everyone in Kenya—from
            first-time sellers to seasoned businesses—using clear tools, helpful
            guidance, and dependable protections.
          </p>
        </section>

        <section>
          <h2>What we value</h2>
          <ul>
            <li>
              <strong>Safety first.</strong> Anti-fraud checks, verified sellers,
              and transparent reporting.
            </li>
            <li>
              <strong>Local by design.</strong> Built around M-Pesa, local pricing,
              and Kenyan buyer behavior.
            </li>
            <li>
              <strong>Less friction.</strong> Quick listing flow, clean search,
              and no noise.
            </li>
          </ul>
        </section>

        <section>
          <h2>How QwikSale helps</h2>
          <ul>
            <li>Simple listing creation with photos and clear categories.</li>
            <li>Seller profiles (username, WhatsApp contact, store page).</li>
            <li>Featured tiers (Gold/Platinum) for extra reach when you need it.</li>
            <li>Fast search and relevant filters to find the right buyer or item.</li>
          </ul>
        </section>

        <section>
          <h2>Policies & support</h2>
          <p>
            We’re committed to safe, fair trading. Read our{" "}
            <Link href="/terms">Terms of Service</Link> and{" "}
            <Link href="/privacy">Privacy Policy</Link>. Need help?{" "}
            <Link href="/support">Contact support</Link>.
          </p>
        </section>

        <section>
          <h2>Work with us</h2>
          <p>
            Have feedback or a partnership idea? Email{" "}
            <a href="mailto:hello@qwiksale.sale">hello@qwiksale.sale</a>.
          </p>
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
