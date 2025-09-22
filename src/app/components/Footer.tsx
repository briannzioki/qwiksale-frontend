// src/app/components/Footer.tsx
"use client";

import Link from "next/link";

export default function Footer() {
  const year = new Date().getFullYear();

  // Lightweight Organization JSON-LD for richer snippets
  const orgLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "QwikSale",
    url: "https://qwiksale.sale/",
    slogan: "Buy & sell, faster. Made in Kenya.",
    sameAs: ["https://qwiksale.sale/", "https://qwiksale.sale/press"],
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        url: "https://qwiksale.sale/help",
        areaServed: "KE",
        availableLanguage: ["en"],
      },
    ],
  };

  const linkClass =
    "hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 rounded-sm";

  return (
    <footer
      className="mt-12 border-t bg-white/70 dark:bg-slate-900/70 backdrop-blur supports-[backdrop-filter]:backdrop-blur-md"
      aria-labelledby="site-footer-title"
    >
      {/* Organization JSON-LD */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }}
      />

      <div className="container-page">
        <h2 id="site-footer-title" className="sr-only">
          QwikSale footer
        </h2>

        {/* Top: brand + nav blocks */}
        <div className="py-10 grid gap-8 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 text-sm">
          {/* Brand / blurb */}
          <div className="space-y-2 lg:col-span-2">
            <div className="font-extrabold text-[#161748] dark:text-white text-lg tracking-tight">
              QwikSale
            </div>
            <p className="text-gray-700 dark:text-slate-400 leading-relaxed">
              Buy & sell, faster. <span className="whitespace-nowrap">Made in Kenya.</span>
            </p>
            <p className="text-xs text-gray-500 dark:text-slate-500">
              Secure listings • KES pricing • Community moderation
            </p>

            {/* Newsletter (no network call; just UI) */}
            <form
              className="mt-4 flex items-stretch gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                // purely cosmetic; wire up to your email provider later
                alert("Thanks! We’ll keep you posted.");
              }}
              aria-label="Subscribe to updates"
            >
              <input
                type="email"
                inputMode="email"
                placeholder="Email for deals & tips"
                className="w-full rounded-lg border px-3 py-2 bg-white/80 dark:bg-slate-900/70 border-gray-300 dark:border-slate-700 text-gray-900 dark:text-slate-100"
                aria-label="Email address"
                required
              />
              <button
                className="rounded-lg bg-[#161748] text-white px-3 py-2 font-semibold hover:opacity-90"
                type="submit"
              >
                Subscribe
              </button>
            </form>

            {/* Trust row */}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-slate-400">
              <span className="inline-flex items-center gap-1">
                <ShieldIcon /> Buyer Safety
              </span>
              <span className="inline-flex items-center gap-1">
                <StarIcon /> Community Rated
              </span>
              <span className="inline-flex items-center gap-1">
                <BoltIcon /> Fast Messaging
              </span>
            </div>
          </div>

          {/* Company */}
          <nav aria-label="Company" className="space-y-3">
            <div className="font-semibold text-gray-900 dark:text-slate-100">Company</div>
            <ul className="space-y-2 text-gray-700 dark:text-slate-400">
              <li>
                <Link className={linkClass} href="/about">
                  About
                </Link>
              </li>
              <li>
                <Link className={linkClass} href="/contact">
                  Contact
                </Link>
              </li>
              <li>
                <Link className={linkClass} href="/help">
                  Help Center
                </Link>
              </li>
              <li>
                <Link className={linkClass} href="/report">
                  Report a Problem
                </Link>
              </li>
              <li>
                <Link className={linkClass} href="/careers">
                  Careers
                </Link>
              </li>
            </ul>
          </nav>

          {/* Legal */}
          <nav aria-label="Legal" className="space-y-3">
            <div className="font-semibold text-gray-900 dark:text-slate-100">Legal</div>
            <ul className="space-y-2 text-gray-700 dark:text-slate-400">
              <li>
                <Link className={linkClass} href="/terms">
                  Terms
                </Link>
              </li>
              <li>
                <Link className={linkClass} href="/privacy">
                  Privacy
                </Link>
              </li>
              <li>
                <Link className={linkClass} href="/safety">
                  Safety
                </Link>
              </li>
              <li>
                <Link className={linkClass} href="/cookies">
                  Cookies
                </Link>
              </li>
            </ul>
          </nav>

          {/* Popular on QwikSale */}
          <nav aria-label="Popular categories" className="space-y-3">
            <div className="font-semibold text-gray-900 dark:text-slate-100">Popular</div>
            <ul className="space-y-2 text-gray-700 dark:text-slate-400">
              <li>
                <Link className={linkClass} href="/?category=Phones">
                  Phones
                </Link>
              </li>
              <li>
                <Link className={linkClass} href="/?category=Electronics">
                  Electronics
                </Link>
              </li>
              <li>
                <Link className={linkClass} href="/?category=Home%20%26%20Living">
                  Home &amp; Living
                </Link>
              </li>
              <li>
                <Link className={linkClass} href="/?category=Fashion">
                  Fashion
                </Link>
              </li>
              <li>
                <Link className={linkClass} href="/?category=Vehicles">
                  Vehicles
                </Link>
              </li>
            </ul>
          </nav>

          {/* Social / Press / Apps */}
          <nav aria-label="Social & Press" className="space-y-3">
            <div className="font-semibold text-gray-900 dark:text-slate-100">Social</div>
            <ul className="space-y-2 text-gray-700 dark:text-slate-400">
              <li>
                <a
                  className={linkClass}
                  href="https://qwiksale.sale/blog"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Blog
                </a>
              </li>
              <li>
                <a
                  className={linkClass}
                  href="https://qwiksale.sale/press"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Press
                </a>
              </li>
              <li className="pt-1">
                <div className="text-xs mb-1 text-gray-500 dark:text-slate-500">
                  Get the app
                </div>
                <div className="flex gap-2">
                  <a
                    href="#"
                    aria-label="Get it on Google Play (coming soon)"
                    className="inline-flex items-center rounded-md border px-2 py-1 text-xs bg-white/70 dark:bg-white/[0.08] border-black/5 dark:border-white/10"
                  >
                    <PlayIcon className="mr-1" />
                    Google Play
                  </a>
                  <a
                    href="#"
                    aria-label="Download on the App Store (coming soon)"
                    className="inline-flex items-center rounded-md border px-2 py-1 text-xs bg-white/70 dark:bg-white/[0.08] border-black/5 dark:border-white/10"
                  >
                    <AppleIcon className="mr-1" />
                    App Store
                  </a>
                </div>
              </li>
            </ul>
          </nav>
        </div>

        {/* Payment / badges strip */}
        <div className="border-t py-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 text-gray-500 dark:text-slate-400">
            <span className="opacity-80">We accept</span>
            <span className="inline-flex items-center gap-1 rounded border px-2 py-0.5 bg-white/70 dark:bg-white/[0.06] border-black/5 dark:border-white/10">
              <MpesaIcon /> M-Pesa
            </span>
            <span className="inline-flex items-center gap-1 rounded border px-2 py-0.5 bg-white/70 dark:bg-white/[0.06] border-black/5 dark:border-white/10">
              <CardIcon /> Cards
            </span>
          </div>

          {/* Language (non-functional placeholder) */}
          <div className="flex items-center gap-2 text-gray-600 dark:text-slate-400">
            <GlobeIcon />
            <select
              aria-label="Language"
              className="bg-transparent border rounded px-2 py-1 text-xs border-black/10 dark:border-white/20"
              defaultValue="en"
            >
              <option value="en">English (KE)</option>
              <option value="sw">Kiswahili</option>
            </select>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-4 border-t text-xs text-gray-600 dark:text-slate-400">
          <p>
            © {year} QwikSale. All rights reserved.
            <span className="ml-2 opacity-80">Built in Nairobi, Kenya.</span>
          </p>
          <p className="opacity-80">
            <span className="mr-2 inline-block align-middle">🇰🇪</span>
            Prices shown in KES.
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ---------------- Icons (tiny inline SVGs to avoid extra deps) ---------------- */

function ShieldIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M12 3l7 3v6a9 9 0 0 1-7 8 9 9 0 0 1-7-8V6l7-3z"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
      />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" fill="none" />
    </svg>
  );
}
function StarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 17.27l5.18 3.05-1.4-6.03 4.64-4.02-6.12-.53L12 4 9.7 9.74l-6.12.53 4.64 4.02-1.4 6.03L12 17.27z" />
    </svg>
  );
}
function BoltIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M13 2L3 14h7l-1 8 11-14h-7l0-6z" />
    </svg>
  );
}
function PlayIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function AppleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M16 13c-.03 3.2 2.8 4.27 2.83 4.28-.02.06-.44 1.5-1.47 2.96-0.89 1.3-1.83 2.6-3.3 2.63-1.44.03-1.9-.85-3.54-.85-1.64 0-2.16.82-3.52.88-1.41.05-2.5-1.4-3.4-2.7-1.85-2.7-3.26-7.7-1.37-11.07 0.95-1.67 2.65-2.73 4.51-2.77 1.4-.03 2.73.93 3.54.93.8 0 2.42-1.15 4.08-.98.69.03 2.62.28 3.86 2.12-0.1.06-2.29 1.34-2.18 3.85zM13.8 3.2c.7-.85 1.2-2.04 1.06-3.2-1.03.04-2.26.68-2.98 1.53-.65.77-1.24 1.98-1.08 3.14 1.14.09 2.31-.58 3-1.47z" />
    </svg>
  );
}
function MpesaIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M8 9h8v2H8zM8 13h6v2H8z" fill="white" />
    </svg>
  );
}
function CardIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <rect x="4" y="10" width="8" height="2" fill="white" />
    </svg>
  );
}
function GlobeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 12h18M12 3c3 4 3 14 0 18M12 3c-3 4-3 14 0 18" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
