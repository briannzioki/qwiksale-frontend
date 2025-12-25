// src/app/search/layout.tsx
import type { Metadata } from "next";
import type React from "react";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Search · QwikSale",
  description: "Search products and services on QwikSale - filters update the URL.",
  // Canonicalize all /search variants to the core URL (prevents duplicate buckets).
  alternates: { canonical: "/search" },
  // The page.tsx server wrapper overrides robots to NOINDEX when any querystring exists.
  robots: { index: true, follow: true },
};

export default function SearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
