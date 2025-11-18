// src/app/layout.tsx
export const runtime = "nodejs";

import type { Metadata, Viewport } from "next";
import type React from "react";
import Script from "next/script";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";

import "./globals.css";

import Providers from "./providers";
import { headers as nextHeaders } from "next/headers";
import { safeAuth } from "@/app/lib/auth";
import { fontVars } from "./fonts";
import SiteHeader from "@/app/components/SiteHeader";
import Footer from "@/app/components/Footer";
import Analytics from "@/app/components/Analytics";
import { getBaseUrl } from "@/app/lib/url";
import SearchHotkeyClient from "@/app/_components/SearchHotkeyClient";
import NavPatch from "@/app/_debug/NavPatch.client";

/* ------------------ headers polyfill (Next 15) ------------------ */
async function readHeaders(): Promise<Headers> {
  const res: any = (nextHeaders as any)();
  return typeof res?.then === "function" ? await res : (res as Headers);
}

/* --------------------------- site / metadata ---------------------------- */

const siteUrl = getBaseUrl().replace(/\/+$/, "");
const isPreview =
  process.env["VERCEL_ENV"] === "preview" ||
  process.env["NEXT_PUBLIC_NOINDEX"] === "1";

/**
 * Dev-only navigation/reload tracer:
 * - Requires NEXT_PUBLIC_DEBUG_NAV=1
 * - Never runs in E2E (NEXT_PUBLIC_E2E=1) or production
 * - Must not interfere with soft-nav Playwright tests
 */
const enableNavDebug =
  process.env["NEXT_PUBLIC_DEBUG_NAV"] === "1" &&
  process.env["NEXT_PUBLIC_E2E"] !== "1" &&
  process.env["NODE_ENV"] !== "production";

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
  metadataBase: new URL(siteUrl),
  applicationName: "QwikSale",
  title: {
    default: "QwikSale — Kenya’s trusted marketplace for all items.",
    template: "%s · QwikSale",
  },
  description:
    "QwikSale — Kenya’s trusted marketplace for all items. List your items, find great deals, and contact sellers directly.",
  keywords: [
    "QwikSale",
    "Kenya",
    "marketplace",
    "buy and sell",
    "peer to peer",
    "mpesa",
  ],
  alternates: {
    canonical: siteUrl + "/",
    languages: { "en-KE": "/", en: "/" },
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    url: siteUrl + "/",
    siteName: "QwikSale",
    title: "QwikSale — Kenya’s trusted marketplace for all items.",
    description:
      "List your items, find great deals, and contact sellers directly. Verified listings get top placement.",
    images: [
      { url: `${siteUrl}/og.png`, width: 1200, height: 630, alt: "QwikSale" },
    ],
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
      {
        url: "/favicon/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/favicon/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
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
      ? {
          "msvalidate.01": process.env["BING_SITE_VERIFICATION"] as string,
        }
      : undefined,
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "QwikSale" },
  category: "marketplace",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await safeAuth();
  const h = await readHeaders();
  const nonce = h.get("x-nonce") ?? undefined;

  const enableAnalytics =
    process.env["NODE_ENV"] === "production" &&
    process.env["NEXT_PUBLIC_E2E"] !== "1" &&
    process.env["NEXT_PUBLIC_ENABLE_ANALYTICS"] !== "0";

  return (
    <html
      lang="en-KE"
      dir="ltr"
      className="h-full"
      suppressHydrationWarning
    >
      <body
        className={`${fontVars} h-full text-gray-900 antialiased dark:text-slate-100`}
        style={{ fontFeatureSettings: "'kern' 1, 'liga' 1, 'calt' 1" }}
        data-env={isPreview ? "preview" : "prod"}
      >
        {/* Slash hotkey → search. No mount-time URL mutation. */}
        <SearchHotkeyClient />

        {/* Dev-only navigation/reload tracer; never active in E2E or prod. */}
        {enableNavDebug ? <NavPatch /> : null}

        <Providers
          session={session}
          refetchIntervalSec={0}
          refetchOnWindowFocus={false}
          remountOnUserChange
        >
          <SiteHeader />
          {children}
          <Footer />
        </Providers>

        {enableAnalytics ? (
          <>
            <VercelAnalytics />
            <Analytics />
          </>
        ) : null}

        {enableAnalytics && process.env["NEXT_PUBLIC_PLAUSIBLE_DOMAIN"] ? (
          <Script
            id="plausible"
            strategy="afterInteractive"
            src="https://plausible.io/js/script.js"
            data-domain={process.env["NEXT_PUBLIC_PLAUSIBLE_DOMAIN"]}
            nonce={nonce}
          />
        ) : null}
      </body>
    </html>
  );
}
