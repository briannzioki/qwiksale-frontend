// src/app/layout.tsx
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import AppShell from "./components/AppShell";
import Providers from "./providers";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

// Build a robust site URL (strip trailing slash)
const envAppUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
  "http://localhost:3000";
const siteUrl = envAppUrl.replace(/\/+$/, "");

// Mark preview/temporary environments as noindex
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
  metadataBase: new URL(siteUrl),
  applicationName: "QwikSale",
  title: {
    default: "QwikSale",
    template: "%s · QwikSale",
  },
  description: "QwikSale — Kenya’s trusted marketplace for all items.",
  keywords: [
    "QwikSale",
    "Kenya",
    "marketplace",
    "buy and sell",
    "peer to peer",
    "mpesa",
  ],
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "QwikSale",
    title: "QwikSale — Kenya’s trusted marketplace for all items.",
    description:
      "List your items, find great deals, and contact sellers directly. Verified listings get top placement.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "QwikSale" }],
    locale: "en_KE",
  },
  twitter: {
    card: "summary_large_image",
    title: "QwikSale — Kenya’s trusted marketplace for all items.",
    description:
      "List your items, find great deals, and contact sellers directly. Verified listings get top placement.",
    images: ["/og-image.png"],
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
        googleBot: {
          index: false,
          follow: false,
          noimageindex: true,
        },
      }
    : {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
        },
      },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "QwikSale" },
  category: "marketplace",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "QwikSale",
    url: siteUrl,
    logo: `${siteUrl}/icon-512.png`,
    sameAs: [
      `${siteUrl}/about`,
      `${siteUrl}/contact`,
      `${siteUrl}/help`,
    ],
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

  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        {/* Prefer a consistent color-scheme hint */}
        <meta name="color-scheme" content="light dark" />

        {/* Optional perf: preconnect to common CDNs (safe no-ops if unused) */}
        <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://images.unsplash.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* Set initial theme BEFORE paint to avoid flicker */}
        <Script id="theme-script" strategy="beforeInteractive">
          {`try {
  const ls = localStorage.getItem('theme');
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  const shouldDark = ls ? (ls === 'dark') : !!mq?.matches;
  document.documentElement.classList.toggle('dark', shouldDark);
} catch {}`}
        </Script>

        {/* JSON-LD: Organization + WebSite */}
        <Script id="ld-org" type="application/ld+json">
          {JSON.stringify(orgJsonLd)}
        </Script>
        <Script id="ld-site" type="application/ld+json">
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
        </div>
      </body>
    </html>
  );
}
