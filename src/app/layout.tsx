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

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "QwikSale",
  title: {
    // No dash here
    default: "QwikSale, Kenya’s trusted marketplace for all items",
    template: "%s · QwikSale",
  },
  // Richer snippet, no dash between name and tagline
  description:
    "QwikSale is Kenya’s trusted marketplace for all items. Buy and sell phones, cars, electronics, furniture and services across Kenya with free listings, clear photos and direct WhatsApp or call enquiries.",
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
    // No dash
    title: "QwikSale, Kenya’s trusted marketplace for all items",
    description:
      "List and discover items and services across Kenya. Post free listings with photos, reach real buyers quickly and keep conversations on WhatsApp or calls.",
    images: [
      {
        url: `${siteUrl}/og.png`,
        width: 1200,
        height: 630,
        alt: "QwikSale",
      },
    ],
    locale: "en_KE",
  },
  twitter: {
    card: "summary_large_image",
    // No dash
    title: "QwikSale, Kenya’s trusted marketplace for all items",
    description:
      "Buy and sell phones, cars, electronics, furniture and services in Kenya. Post free listings with photos and talk directly to buyers and sellers.",
    images: [`${siteUrl}/og.png`],
  },
  icons: {
    // Put your main logo first so browsers and Google pick it up
    icon: [
      { url: "/brand/qwiksale-logo.jpg", type: "image/jpeg" },
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
        className={`${fontVars} h-full antialiased bg-app text-strong`}
        style={{ fontFeatureSettings: "'kern' 1, 'liga' 1, 'calt' 1" }}
        data-env={isPreview ? "preview" : "prod"}
      >
        {/* Slash hotkey → search. No mount-time URL mutation. */}
        <SearchHotkeyClient />

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
