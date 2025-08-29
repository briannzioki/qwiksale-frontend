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

// Ensure no trailing slash so Metadata URLs compose correctly
const siteUrl =
  (process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ||
    "http://localhost:3000") as string;

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
  appleWebApp: { capable: true, statusBarStyle: "default", title: "QwikSale" },
  category: "marketplace",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        {/* Optional perf: preconnect to common CDNs you use (safe no-ops if unused) */}
        <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="" />
        <link rel="preconnect" href="https://images.unsplash.com" crossOrigin="" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />

        {/* Set initial theme BEFORE paint to avoid flicker */}
        <Script id="theme-script" strategy="beforeInteractive">
          {`try {
  const ls = localStorage.getItem('theme');
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  const shouldDark = ls ? (ls === 'dark') : !!mq?.matches;
  document.documentElement.classList.toggle('dark', shouldDark);
} catch {}`}
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
