// src/app/layout.tsx
import { headers } from "next/headers";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import crypto from "crypto";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";
import AppShell from "./components/AppShell";
import Providers from "./providers";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

// Robust site URL (strip trailing slash)
const envAppUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
  "http://localhost:3000";
const siteUrl = envAppUrl.replace(/\/+$/, "");

const isPreview =
  process.env.VERCEL_ENV === "preview" ||
  process.env.NEXT_PUBLIC_NOINDEX === "1";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  metadataBase: (() => {
    try {
      return new URL(siteUrl);
    } catch {
      return new URL("http://localhost:3000");
    }
  })(),
  applicationName: "QwikSale",
  title: { default: "QwikSale", template: "%s · QwikSale" },
  description: "QwikSale — Kenya’s trusted marketplace for all items.",
  keywords: ["QwikSale", "Kenya", "marketplace", "buy and sell", "peer to peer", "mpesa"],
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "QwikSale",
    title: "QwikSale — Kenya’s trusted marketplace for all items.",
    description:
      "List your items, find great deals, and contact sellers directly. Verified listings get top placement.",
    images: [{ url: `${siteUrl}/og-image.png`, width: 1200, height: 630, alt: "QwikSale" }],
    locale: "en_KE",
  },
  twitter: {
    card: "summary_large_image",
    title: "QwikSale — Kenya’s trusted marketplace for all items.",
    description:
      "List your items, find great deals, and contact sellers directly. Verified listings get top placement.",
    images: [`${siteUrl}/og-image.png`],
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  robots: isPreview
    ? { index: false, follow: false, googleBot: { index: false, follow: false, noimageindex: true } }
    : { index: true, follow: true, googleBot: { index: true, follow: true } },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "QwikSale" },
  category: "marketplace",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Get CSP nonce from middleware (fallback locally)
  let nonce: string;
  try {
    const h = await headers(); // Next 15: headers() can be awaited in RSC
    nonce = h.get("x-nonce") ?? crypto.randomBytes(16).toString("base64");
  } catch {
    nonce = crypto.randomBytes(16).toString("base64");
  }

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "QwikSale",
    url: siteUrl,
    logo: `${siteUrl}/icon-512.png`,
    sameAs: [`${siteUrl}/about`, `${siteUrl}/contact`, `${siteUrl}/help`],
  };

  const siteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "QwikSale",
    url: siteUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
  const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

  return (
    <html lang="en" dir="ltr" className="h-full" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />

        {/* Site verification (optional) */}
        <meta name="google-site-verification" content={process.env.GOOGLE_SITE_VERIFICATION || ""} />
        <meta name="msvalidate.01" content={process.env.BING_SITE_VERIFICATION || ""} />

        <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://images.unsplash.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* Set initial theme BEFORE paint to avoid flicker */}
        <Script id="theme-script" strategy="beforeInteractive" nonce={nonce}>
          {`try {
  const ls = localStorage.getItem('theme');
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  const shouldDark = ls ? (ls === 'dark') : !!mq?.matches;
  document.documentElement.classList.toggle('dark', shouldDark);
} catch {}`}
        </Script>

        {/* JSON-LD */}
        <Script id="ld-org" type="application/ld+json" nonce={nonce}>
          {JSON.stringify(orgJsonLd)}
        </Script>
        <Script id="ld-site" type="application/ld+json" nonce={nonce}>
          {JSON.stringify(siteJsonLd)}
        </Script>
      </head>
      <body
        className={`${inter.variable} h-full text-gray-900 antialiased dark:text-slate-100`}
        style={{ fontFeatureSettings: "'kern' 1, 'liga' 1, 'calt' 1" }}
      >
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-[#f9fafb] to-[#f0f4ff] dark:from-slate-950 dark:via-[#0b1220] dark:to-black">
          <Providers>
            <AppShell>{children}</AppShell>
          </Providers>

          {/* Vercel Analytics */}
          <VercelAnalytics />

          {/* Plausible (optional) */}
          {PLAUSIBLE_DOMAIN ? (
            <Script
              id="plausible"
              nonce={nonce}
              strategy="afterInteractive"
              src="https://plausible.io/js/script.js"
              data-domain={PLAUSIBLE_DOMAIN}
            />
          ) : null}

          {/* Google Analytics 4 (optional) */}
          {GA_ID ? (
            <>
              <Script
                id="ga-loader"
                nonce={nonce}
                strategy="afterInteractive"
                src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              />
              <Script id="ga-init" nonce={nonce} strategy="afterInteractive">
                {`
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${GA_ID}', {
                    anonymize_ip: true,
                    send_page_view: true,
                  });
                `}
              </Script>
            </>
          ) : null}
        </div>
      </body>
    </html>
  );
}
