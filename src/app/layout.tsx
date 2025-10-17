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
import { headers } from "next/headers";
import Analytics from "./components/Analytics";

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
    images: [{ url: `${siteUrl}/og.png`, width: 1200, height: 630, alt: "QwikSale" }],
    locale: "en_KE",
  },
  twitter: {
    card: "summary_large_image",
    title: "QwikSale — Kenya’s trusted marketplace for all items.",
    description:
      "List your items, find great deals, and contact sellers directly. Verified listings get top placement.",
    images: [`${siteUrl}/og.png`],
  },
  icons: {
    icon: [
      { url: "/favicon/favicon.ico" },
      { url: "/favicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/favicon/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/favicon/apple-touch-icon.png", sizes: "180x180" }],
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
  const session = await getServerSession();

  // Pull CSP nonce from middleware (x-nonce) so inline/3P scripts satisfy script-src
  const h = await headers();
  const nonce = h.get("x-nonce") ?? undefined;

  const site = {
    url: siteUrl,
    orgJsonLd: {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "QwikSale",
      url: siteUrl,
      logo: `${siteUrl}/favicon/android-chrome-512x512.png`,
      sameAs: [
        "https://www.tiktok.com/@qwiksale.sale",   // TikTok
        "https://www.linkedin.com/company/qwiksale", // LinkedIn (adjust slug if different)
      ],
    } as const,
    siteJsonLd: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "QwikSale",
      url: siteUrl,
      potentialAction: {
        "@type": "SearchAction",
        target: `${siteUrl}/search?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    } as const,
  } as const;

  const PLAUSIBLE_DOMAIN = process.env["NEXT_PUBLIC_PLAUSIBLE_DOMAIN"];

  // Gradient header slot
  const headerSlot = (
    <header
      className="bg-spotlight bg-noise text-white"
      style={{ WebkitMaskImage: "linear-gradient(to bottom, black 80%, transparent)" }}
    >
      <div className="container-page pt-10 pb-4 md:pt-12 md:pb-6">
        <div className="flex items-end justify-between gap-4">
          <h1 className="text-balance text-2xl md:text-3xl font-extrabold tracking-tight text-gradient">
            QwikSale
          </h1>
          <div id="page-header-actions" className="flex items-center gap-2" />
        </div>
      </div>
    </header>
  );

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

        {/* Social identity hints (helps entity matching) */}
        <link rel="me" href="https://www.tiktok.com/@qwiksale.sale" />
        <link rel="me" href="https://www.linkedin.com/company/qwiksale" />

        {/* Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* Theme bootstrap with nonce — prevents dark/light flash */}
        <Script
          id="theme-script"
          strategy="beforeInteractive"
          nonce={nonce}
        >{`(() => {
  try {
    var m = (localStorage.getItem('theme') || 'system').toLowerCase();
    var isSystem = m === 'system';
    var prefersDark = false;
    try {
      prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {}
    var dark = (m === 'dark') || (isSystem && prefersDark);

    var root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
    root.setAttribute('data-theme-mode', m);
  } catch {}
})();`}</Script>

        {/* Structured data */}
        <Script id="ld-org" type="application/ld+json" nonce={nonce}>
          {JSON.stringify(site.orgJsonLd)}
        </Script>
        <Script id="ld-site" type="application/ld+json" nonce={nonce}>
          {JSON.stringify(site.siteJsonLd)}
        </Script>
      </head>

      <body
        className={`${fontVars} h-full text-gray-900 antialiased dark:text-slate-100`}
        style={{ fontFeatureSettings: "'kern' 1, 'liga' 1, 'calt' 1" }}
        data-env={isPreview ? "preview" : "prod"}
      >
        {/* Background foundation */}
        <div className="relative min-h-screen isolate bg-gradient-to-br from-gray-50 via-[#f9fafb] to-[#eef6ff] dark:from-slate-950 dark:via-[#0b1220] dark:to-black">
          <div className="absolute inset-0 pointer-events-none bg-noise" aria-hidden />

          <Providers session={session}>
            <AppShell headerSlot={headerSlot}>{children}</AppShell>

            {/* Toasts (portal) */}
            <ToasterClient
              extraToastOptions={{
                duration: 3500,
                style: { borderRadius: "12px" },
              }}
            />
          </Providers>
        </div>

        {/* Analytics & scripts */}
        <VercelAnalytics />
        <Analytics />

        {process.env["NEXT_PUBLIC_PLAUSIBLE_DOMAIN"] ? (
          <Script
            id="plausible"
            strategy="afterInteractive"
            src="https://plausible.io/js/script.js"
            data-domain={process.env["NEXT_PUBLIC_PLAUSIBLE_DOMAIN"]}
            nonce={nonce}
          />
        ) : null}

        {SHOW_DEV_CONTROLS ? <DevToolsMount /> : null}
      </body>
    </html>
  );
}
