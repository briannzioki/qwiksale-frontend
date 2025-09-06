// src/app/components/Footer.tsx
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
    sameAs: [
      "https://qwiksale.sale/",
      "https://qwiksale.sale/press",
    ],
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
        <div className="py-10 grid gap-8 sm:grid-cols-2 md:grid-cols-4 text-sm">
          <div className="space-y-2">
            <div className="font-extrabold text-[#161748] dark:text-white text-lg tracking-tight">
              QwikSale
            </div>
            <p className="text-gray-700 dark:text-slate-400 leading-relaxed">
              Buy & sell, faster. <span className="whitespace-nowrap">Made in Kenya.</span>
            </p>
            <p className="text-xs text-gray-500 dark:text-slate-500">
              Secure listings • KES pricing • Community moderation
            </p>
          </div>

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
            </ul>
          </nav>

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
            </ul>
          </nav>

          <nav aria-label="Social & Press" className="space-y-3">
            <div className="font-semibold text-gray-900 dark:text-slate-100">Social</div>
            <ul className="space-y-2 text-gray-700 dark:text-slate-400">
              {/* Replace with your actual handles if you add socials */}
              <li>
                <a
                  className={linkClass}
                  href="https://qwiksale.sale/"
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
            </ul>
          </nav>
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
