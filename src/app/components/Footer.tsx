"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/app/components/Button";
import { toast } from "@/app/components/ToasterClient";

export default function Footer() {
  const year = new Date().getFullYear();
  const base =
    (process.env["NEXT_PUBLIC_APP_URL"] || "https://qwiksale.sale")
      .replace(/\/+$/, "") || "https://qwiksale.sale";

  // Lightweight Organization JSON-LD for richer snippets
  const orgLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "QwikSale",
    url: `${base}/`,
    slogan: "Buy & sell, faster. Made in Kenya.",
    sameAs: [
      `${base}/`,
      `${base}/press`,
      "https://www.tiktok.com/@qwiksale.sale",
      "https://www.linkedin.com/company/qwiksale",
    ],
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        url: `${base}/help`,
        areaServed: "KE",
        availableLanguage: ["en"],
      },
    ],
  };

  const linkClass =
    "hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 " +
    "focus-visible:ring-offset-2 ring-offset-[var(--bg)] ring-focus rounded-sm";

  // --- Newsletter state/handlers (client-only) ---
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function onSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    const trimmed = email.trim();
    // super simple, good-enough validation
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
    if (!ok) {
      toast.error("Enter a valid email address.");
      return;
    }

    setBusy(true);

    const endpoint = process.env["NEXT_PUBLIC_NEWSLETTER_POST_URL"];
    try {
      if (endpoint) {
        const r = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ email: trimmed, source: "footer" }),
        });
        if (!r.ok) {
          // try to show server error if present
          let msg = "Subscription failed.";
          try {
            const j = await r.json();
            if (j?.error) msg = String(j.error);
          } catch {}
          throw new Error(msg);
        }
      } else {
        // Simulate latency so the user sees feedback even without backend wiring
        await new Promise((res) => setTimeout(res, 500));
      }

      toast.success("Subscribed! We’ll keep you posted.");
      setEmail("");
    } catch (err: any) {
      toast.error(err?.message || "Could not subscribe. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <footer
      className="mt-8 sm:mt-12 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] backdrop-blur supports-[backdrop-filter]:backdrop-blur-md"
      aria-labelledby="site-footer-title"
      role="contentinfo"
    >
      {/* Organization JSON-LD */}
      <script
        id="org-jsonld"
        type="application/ld+json"
        suppressHydrationWarning
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }}
      />

      <div className="container-page text-[var(--text-muted)]">
        <h2 id="site-footer-title" className="sr-only">
          QwikSale footer
        </h2>

        {/* Top: brand + nav blocks */}
        <div className="grid gap-6 py-8 text-[13px] sm:gap-8 sm:py-10 sm:text-sm sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
          {/* Brand / blurb */}
          <div className="space-y-1.5 lg:col-span-2">
            <div className="text-base sm:text-lg font-extrabold tracking-tight text-[var(--text)]">
              QwikSale
            </div>

            <p className="leading-relaxed text-[var(--text-muted)]">
              Buy & sell, faster.{" "}
              <span className="whitespace-nowrap">Made in Kenya.</span>
            </p>

            <p className="text-[11px] sm:text-xs text-[var(--text-muted)]">
              Secure listings • KES pricing • Community moderation
            </p>

            {/* Newsletter */}
            <form
              className="mt-3 sm:mt-4 flex items-stretch gap-2"
              onSubmit={onSubscribe}
              noValidate
            >
              {/* Label intentionally not matching /email/i */}
              <label htmlFor="newsletter-email" className="sr-only">
                Newsletter
              </label>
              <input
                id="newsletter-email"
                type="email"
                inputMode="email"
                placeholder="Email for deals & tips"
                className={[
                  "w-full rounded-xl px-3 py-2 text-sm",
                  "bg-[var(--bg)] text-[var(--text)]",
                  "border border-[var(--border)]",
                  "placeholder:text-[var(--text-muted)]",
                  "shadow-inner",
                  "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                ].join(" ")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                autoComplete="email"
              />
              <Button
                type="submit"
                size="sm"
                loading={busy}
                aria-disabled={busy || undefined}
                title={busy ? "Subscribing…" : "Subscribe to newsletter"}
              >
                Subscribe
              </Button>
            </form>

            {/* Trust row */}
            <div className="mt-3 sm:mt-4 flex flex-wrap items-center gap-2.5 text-[11px] sm:text-xs text-[var(--text-muted)]">
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
          <nav aria-label="Company" className="space-y-2.5 sm:space-y-3">
            <div className="font-semibold text-[var(--text)]">Company</div>
            <ul className="space-y-1.5 sm:space-y-2">
              <li>
                <Link className={linkClass} href="/about" prefetch={false}>
                  About
                </Link>
              </li>
              <li>
                <Link className={linkClass} href="/contact" prefetch={false}>
                  Contact
                </Link>
              </li>
              <li>
                <Link className={linkClass} href="/help" prefetch={false}>
                  Help Center
                </Link>
              </li>
              <li>
                <Link className={linkClass} href="/report" prefetch={false}>
                  Report a Problem
                </Link>
              </li>
              <li>
                <Link className={linkClass} href="/careers" prefetch={false}>
                  Careers
                </Link>
              </li>
            </ul>
          </nav>

          {/* Legal */}
          <nav aria-label="Legal" className="space-y-2.5 sm:space-y-3">
            <div className="font-semibold text-[var(--text)]">Legal</div>
            <ul className="space-y-1.5 sm:space-y-2">
              <li>
                <Link className={linkClass} href="/terms" prefetch={false}>
                  Terms
                </Link>
              </li>
              <li>
                <Link className={linkClass} href="/privacy" prefetch={false}>
                  Privacy
                </Link>
              </li>
              <li>
                <Link className={linkClass} href="/safety" prefetch={false}>
                  Safety
                </Link>
              </li>
              <li>
                <Link className={linkClass} href="/cookies" prefetch={false}>
                  Cookies
                </Link>
              </li>
            </ul>
          </nav>

          {/* Popular on QwikSale */}
          <nav aria-label="Popular categories" className="space-y-2.5 sm:space-y-3">
            <div className="font-semibold text-[var(--text)]">Popular</div>
            <ul className="space-y-1.5 sm:space-y-2">
              <li>
                <Link className={linkClass} href="/?category=Phones" prefetch={false}>
                  Phones
                </Link>
              </li>
              <li>
                <Link className={linkClass} href="/?category=Electronics" prefetch={false}>
                  Electronics
                </Link>
              </li>
              <li>
                <Link className={linkClass} href="/?category=Home%20%26%20Living" prefetch={false}>
                  Home &amp; Living
                </Link>
              </li>
              <li>
                <Link className={linkClass} href="/?category=Fashion" prefetch={false}>
                  Fashion
                </Link>
              </li>
              <li>
                <Link className={linkClass} href="/?category=Vehicles" prefetch={false}>
                  Vehicles
                </Link>
              </li>
            </ul>
          </nav>

          {/* Social / Press / Apps */}
          <nav aria-label="Social & Press" className="space-y-2.5 sm:space-y-3">
            <div className="font-semibold text-[var(--text)]">Social</div>
            <ul className="space-y-1.5 sm:space-y-2">
              <li>
                <a
                  className={`${linkClass} inline-flex items-center gap-1.5`}
                  href="https://www.tiktok.com/@qwiksale.sale"
                  target="_blank"
                  rel="me noopener noreferrer"
                  aria-label="TikTok - QwikSale"
                >
                  <TikTokIcon />
                  TikTok
                </a>
              </li>
              <li>
                <a
                  className={`${linkClass} inline-flex items-center gap-1.5`}
                  href="https://www.linkedin.com/company/qwiksale"
                  target="_blank"
                  rel="me noopener noreferrer"
                  aria-label="LinkedIn - QwikSale"
                >
                  <LinkedInIcon />
                  LinkedIn
                </a>
              </li>
              <li>
                <li>
                  <Link className={linkClass} href="/blog" prefetch={false}>
                   Blog
                  </Link>
                </li>
<li>
  <Link className={linkClass} href="/press" prefetch={false}>
    Press
  </Link>
</li>
              </li>
              <li className="pt-1">
                <div className="mb-1 text-[11px] sm:text-xs text-[var(--text-muted)]">
                  Get the app
                </div>
                <div className="flex gap-2">
                  <a
                    href="#"
                    aria-label="Get it on Google Play (coming soon)"
                    className="inline-flex items-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px] sm:text-xs text-[var(--text)]"
                    rel="nofollow noopener"
                    target="_blank"
                  >
                    <PlayIcon className="mr-1" />
                    Google Play
                  </a>
                  <a
                    href="#"
                    aria-label="Download on the App Store (coming soon)"
                    className="inline-flex items-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px] sm:text-xs text-[var(--text)]"
                    rel="nofollow noopener"
                    target="_blank"
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] py-3 sm:py-4 text-[11px] sm:text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-3">
            <span className="opacity-80">We accept</span>
            <span className="inline-flex items-center gap-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-0.5">
              <MpesaIcon /> M-Pesa
            </span>
            <span className="inline-flex items-center gap-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-0.5">
              <CardIcon /> Cards
            </span>
          </div>

          {/* Language (placeholder) */}
          <div className="flex items-center gap-2">
            <GlobeIcon />
            <label htmlFor="lang" className="sr-only">
              Language
            </label>
            <select
              id="lang"
              aria-label="Language"
              className="rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-2 py-1 text-[11px] sm:text-xs text-[var(--text-muted)]"
              defaultValue="en"
            >
              <option value="en">English (KE)</option>
              <option value="sw">Kiswahili</option>
            </select>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col items-start justify-between gap-2.5 border-t border-[var(--border-subtle)] py-3 sm:py-4 text-[11px] sm:text-xs text-[var(--text-muted)] sm:flex-row sm:items-center">
          <p>
            © {year} QwikSale. All rights reserved.
            <span className="ml-2 opacity-80">Built in Nairobi, Kenya.</span>
          </p>
          <p className="opacity-80">
            <span className="mr-2 inline-block align-middle" aria-hidden="true">
              🇰🇪
            </span>
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
      <path
        d="M9 12l2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
      />
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
      <path d="M16 13c-.03 3.2 2.8 4.27 2.83 4.28-.02.06-.44 1.5-1.47 2.96-0.89 1.3-1.83 2.6-3.3 2.63-1.44.03-1.9-.85-3.54-.85-1.64 0-2.16.82-3.52.88-1.41.05-2.5-1.4-3.4-2.7-1.85-2.7-3.26-7.7-1.37-11.07.95-1.67 2.65-2.73 4.51-2.77 1.4-.03 2.73.93 3.54.93.8 0 2.42-1.15 4.08-.98.69.03 2.62.28 3.86 2.12-.1.06-2.29 1.34-2.18 3.85zM13.8 3.2c.7-.85 1.2-2.04 1.06-3.2-1.03.04-2.26.68-2.98 1.53-.65.77-1.24 1.98-1.08 3.14 1.14.09 2.31-.58 3-1.47z" />
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
      <path
        d="M3 12h18M12 3c3 4 3 14 0 18M12 3c-3 4-3 14 0 18"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

/* Social icons */
function TikTokIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 48 48"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M33.6 12.1c2.4 1.8 5.2 3 8.3 3.3v6.6c-3.5-.1-6.9-1.2-9.8-3.1v12.3c0 7-5.7 12.6-12.6 12.6S6.9 38.2 6.9 31.3c0-6.9 5.6-12.6 12.6-12.6 1 0 2 .1 2.9.4v6.9a6 6 0 00-2.9-.7c-3.2 0-5.7 2.6-5.7 5.8s2.6 5.8 5.7 5.8 5.8-2.6 5.8-5.8V5h6.3c.2 2.7 1.1 5 2.9 7.1z" />
    </svg>
  );
}
function LinkedInIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1 4.98 2.12 4.98 3.5zM.5 8.5h4V23h-4V8.5zM8.5 8.5h3.8v2h.1c.5-.9 1.8-2.2 3.9-2.2 4.2 0 5 2.8 5 6.5V23h-4v-6.5c0-1.5 0-3.5-2.2-3.5s-2.5 1.7-2.5 3.4V23h-4V8.5z" />
    </svg>
  );
}
