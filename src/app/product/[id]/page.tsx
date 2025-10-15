// src/app/product/[id]/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import ProductPageClient, { type ProductWire } from "./ProductPageClient";

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

async function fetchInitialProduct(id: string): Promise<ProductWire | null> {
  try {
    const res = await fetch(makeApiUrl(`/api/products/${encodeURIComponent(id)}`), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (res.status === 404) return null;

    const j = await res.json().catch(() => ({} as any));
    if (!res.ok) return null;

    // Accept both {product: {...}} and {...}
    const maybe: ProductWire =
      (j && (("product" in j ? (j as any).product : j) as ProductWire)) || null;

    // Public pages should only show ACTIVE
    const status = (maybe as any)?.status;
    if (status && String(status).toUpperCase() !== "ACTIVE") return null;

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
  const initialData = id ? await fetchInitialProduct(id) : null;

  return <ProductPageClient id={id} initialData={initialData} />;
}

// Optional: keep minimal metadata to avoid stale SEO explosions on errors.
export const metadata: Metadata = {
  robots: { index: true, follow: true },
};
