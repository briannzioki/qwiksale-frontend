// src/app/service/[id]/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import ServicePageClient, { type ServiceWire } from "./ServicePageClient";

/** Build absolute URL on the server (dev/prod safe) */
function makeApiUrl(path: string) {
  const explicit = process.env["NEXT_PUBLIC_APP_URL"];
  const vercel = process.env["VERCEL_URL"];
  const base =
    explicit ||
    (vercel ? (vercel.startsWith("http") ? vercel : `https://${vercel}`) : null) ||
    "http://127.0.0.1:3000";
  return new URL(path, base).toString();
}

/** ONE server fetch. No retries, no image probing, no extra requests. */
async function fetchInitialService(id: string): Promise<ServiceWire | null> {
  try {
    const res = await fetch(makeApiUrl(`/api/services/${encodeURIComponent(id)}`), {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "cache-control": "no-store",
      },
    });

    if (res.status === 404) return null;
    if (!res.ok) return null;

    const j = (await res.json().catch(() => null)) as unknown;

    // Accept both { service: {...} } and bare payload {...}
    const maybe =
      (j && typeof j === "object" && "service" in (j as any)
        ? ((j as any).service as ServiceWire)
        : (j as ServiceWire | null)) ?? null;

    return maybe;
  } catch {
    return null;
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Single SSR fetch for initial paint
  const initialData = id ? await fetchInitialService(id) : null;

  // Prefer the API’s canonical id if provided
  const canonicalId = initialData?.id ?? id;

  return <ServicePageClient id={canonicalId} initialData={initialData} />;
}

// Minimal, permissive metadata (can be overridden by client/SEO builder if needed)
export const metadata: Metadata = {
  robots: { index: true, follow: true },
};
