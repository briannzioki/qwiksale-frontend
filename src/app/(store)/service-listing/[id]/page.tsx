// src/app/(store)/service-listing/[id]/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function LegacyServiceListingRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id || !String(id).trim()) notFound();

  // 🧹 Old route → canonical service page
  permanentRedirect(`/service/${encodeURIComponent(id)}`);
}
