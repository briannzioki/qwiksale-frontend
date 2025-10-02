// src/app/layout.tsx
export const runtime = "nodejs"; // NextAuth/Prisma need Node runtime

import "./globals.css";
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";
import Providers from "./providers";
import AppShell from "./components/AppShell";
import DevToolsMount from "./components/DevToolsMount";
import { fontVars } from "./fonts";
import ToasterClient from "./components/ToasterClient";
import { getBaseUrl } from "@/app/lib/url";
import { getServerSession } from "@/app/lib/auth";

/* ----------------------------- Site URL helpers ---------------------------- */
const siteUrl = getBaseUrl().replace(/\/+$/, "");
const isPreview =
  process.env["VERCEL_ENV"] === "preview" || process.env["NEXT_PUBLIC_NOINDEX"] === "1";

/* Hide any demo/dev error controls by default so tests don’t see generic “error/try again” text. */
const SHOW_DEV_CONTROLS = process.env["NEXT_PUBLIC_SHOW_DEV_CONTROLS"] === "1";

/* -------------------------------- Viewport -------------------------------- */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

/* ------------------------------- Site metadata ----------------------------- */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "QwikSale",
  title: { default: "QwikSale", template: "%s · QwikSale" },
  description:
    "QwikSale — Kenya’s trusted marketplace for all items. List your items, find great deals, and contact sellers directly.",
  keywords: ["QwikSale", "Kenya", "marketplace", "buy and sell", "peer to peer", "mpesa"],
  alternates: { canonical: siteUrl + "/", languages: { "en-KE": "/", en: "/" } },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    url: siteUrl + "/",
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
    ? {
        index: false,
        follow: false,
        nocache: true,
        googleBot: { index: false, follow: false, noimageindex: true },
      }
    : {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-image-preview": "large",
          "max-video-preview": -1,
          "max-snippet": -1,
        },
      },
  verification: {
    google: process.env["GOOGLE_SITE_VERIFICATION"] || undefined,
    other: process.env["BING_SITE_VERIFICATION"]
      ? { "msvalidate.01": process.env["BING_SITE_VERIFICATION"] as string }
      : undefined,
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "QwikSale" },
  category: "marketplace",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Get the NextAuth session on the server and pass it to SessionProvider
  const session = await getServerSession();

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "QwikSale",
    url: siteUrl,
    logo: `${siteUrl}/icon-512.png`,
    sameAs: [`${siteUrl}/about`, `${siteUrl}/contact`, `${siteUrl}/help`],
  } as const;

  const siteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "QwikSale",
    url: siteUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  } as const;

  const GA_ID = process.env["NEXT_PUBLIC_GA_ID"];
  const PLAUSIBLE_DOMAIN = process.env["NEXT_PUBLIC_PLAUSIBLE_DOMAIN"];

  return (
    <html lang="en-KE" dir="ltr" className="h-full" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />

        {/* Preconnect + DNS prefetch for image CDNs */}
        <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="//res.cloudinary.com" />
        <link rel="preconnect" href="https://images.unsplash.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="//images.unsplash.com" />
        <link rel="preconnect" href="https://plus.unsplash.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="//plus.unsplash.com" />
        <link rel="preconnect" href="https://lh3.googleusercontent.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="//lh3.googleusercontent.com" />
        <link rel="preconnect" href="https://avatars.githubusercontent.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="//avatars.githubusercontent.com" />
        <link rel="preconnect" href="https://images.pexels.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="//images.pexels.com" />
        <link rel="preconnect" href="https://picsum.photos" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="//picsum.photos" />

        {/* Fonts (pair these; gstatic needs crossorigin) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        <Script id="theme-script" strategy="beforeInteractive">{`try {
  const ls = localStorage.getItem('theme');
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  const shouldDark = ls ? (ls === 'dark') : !!mq?.matches;
  document.documentElement.classList.toggle('dark', shouldDark);
} catch {}`}</Script>

        <Script id="ld-org" type="application/ld+json">
          {JSON.stringify(orgJsonLd)}
        </Script>
        <Script id="ld-site" type="application/ld+json">
          {JSON.stringify(siteJsonLd)}
        </Script>
      </head>

      <body
        className={`${fontVars} h-full text-gray-900 antialiased dark:text-slate-100`}
        style={{ fontFeatureSettings: "'kern' 1, 'liga' 1, 'calt' 1" }}
        data-env={isPreview ? "preview" : "prod"}
      >
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-[#f9fafb] to-[#f0f4ff] dark:from-slate-950 dark:via-[#0b1220] dark:to-black">
          {/* Providers is a CLIENT component that mounts SessionProvider with no refetch thrash */}
          <Providers session={session}>
            <AppShell>{children}</AppShell>
            {/* Mount the toaster once for the whole app */}
            <ToasterClient />
          </Providers>

          <VercelAnalytics />

          {PLAUSIBLE_DOMAIN ? (
            <Script
              id="plausible"
              strategy="afterInteractive"
              src="https://plausible.io/js/script.js"
              data-domain={PLAUSIBLE_DOMAIN}
            />
          ) : null}

          {GA_ID ? (
            <>
              <Script
                id="ga-loader"
                strategy="afterInteractive"
                src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              />
              <Script id="ga-init" strategy="afterInteractive">{`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}', { anonymize_ip: true, send_page_view: true });
              `}</Script>
            </>
          ) : null}

          {/* Dev/demo controls are hidden unless explicitly enabled */}
          {SHOW_DEV_CONTROLS ? <DevToolsMount /> : null}
        </div>
      </body>
    </html>
  );
}
