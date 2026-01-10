export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ProductPageClient, {
  type ProductWire as ClientProductWire,
  type ReviewWire as ClientReviewWire,
  type ReviewSummaryWire as ClientReviewSummaryWire,
} from "./ProductPageClient";
import { makeApiUrl } from "@/app/lib/url";

/* ------------------------------ Utilities ------------------------------ */

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
    return "Contact for price";
  }
  try {
    return `KES ${new Intl.NumberFormat("en-KE").format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

function isActiveListing(raw: unknown): boolean {
  const s = String((raw as any)?.status ?? "").trim();
  if (!s) return true; // if API doesn't provide status, don't 404 it
  return s.toUpperCase() === "ACTIVE";
}

function coerceLatLng(n: unknown, kind: "lat" | "lng"): number | null {
  const v = typeof n === "number" ? n : typeof n === "string" ? Number(n) : NaN;
  if (!Number.isFinite(v)) return null;
  if (kind === "lat" && (v < -90 || v > 90)) return null;
  if (kind === "lng" && (v < -180 || v > 180)) return null;
  return v;
}

function extractLatLngFromUrl(raw: unknown): { lat: number; lng: number } | null {
  if (typeof raw !== "string") return null;
  const url = raw.trim();
  if (!url) return null;

  const patterns: RegExp[] = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&]q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&]query=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&]destination=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
  ];

  for (const re of patterns) {
    const m = url.match(re);
    if (!m) continue;
    const lat = coerceLatLng(m[1], "lat");
    const lng = coerceLatLng(m[2], "lng");
    if (lat == null || lng == null) continue;
    return { lat, lng };
  }

  return null;
}

function resolveStoreGeoFromProduct(product: any): { lat: number; lng: number; source: string } | null {
  if (!product || typeof product !== "object") return null;

  const directLat =
    coerceLatLng(product?.storeLat, "lat") ??
    coerceLatLng(product?.sellerStoreLat, "lat") ??
    coerceLatLng(product?.seller?.storeLat, "lat") ??
    coerceLatLng(product?.seller?.lat, "lat") ??
    null;

  const directLng =
    coerceLatLng(product?.storeLng, "lng") ??
    coerceLatLng(product?.sellerStoreLng, "lng") ??
    coerceLatLng(product?.seller?.storeLng, "lng") ??
    coerceLatLng(product?.seller?.lng, "lng") ??
    null;

  if (directLat != null && directLng != null) {
    return { lat: directLat, lng: directLng, source: "payload" };
  }

  const url =
    (typeof product?.sellerStoreLocationUrl === "string" && product.sellerStoreLocationUrl) ||
    (typeof product?.seller?.storeLocationUrl === "string" && product.seller.storeLocationUrl) ||
    (typeof product?.storeLocationUrl === "string" && product.storeLocationUrl) ||
    null;

  const parsed = extractLatLngFromUrl(url);
  if (parsed) return { ...parsed, source: "url" };

  return null;
}

/* ------------------------------- Fetchers ------------------------------ */

async function fetchInitialProduct(
  id: string,
): Promise<{ product: ClientProductWire | null; status: number }> {
  try {
    const primaryUrl = makeApiUrl(`/api/products/${encodeURIComponent(id)}`);
    const res = await fetch(primaryUrl, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (res.status === 404) {
      const alt = await fetch(makeApiUrl(`/api/products?ids=${encodeURIComponent(id)}`), {
        cache: "no-store",
        headers: { Accept: "application/json" },
      }).catch(() => null);

      const altJson = ((await alt?.json().catch(() => null)) as any) || {};

      const cand = Array.isArray(altJson?.items)
        ? (altJson.items.find((x: any) => String(x?.id) === String(id)) as ClientProductWire | undefined)
        : null;

      if (cand) return { product: cand, status: 200 };
      return { product: null, status: 404 };
    }

    const json = ((await res.json().catch(() => ({}))) || {}) as any;
    const wire = ((json.product ?? json) || null) as ClientProductWire | null;

    return { product: wire, status: res.status };
  } catch {
    return { product: null, status: 0 };
  }
}

async function fetchInitialReviews(
  listingId: string,
): Promise<{ reviews: ClientReviewWire[]; summary: ClientReviewSummaryWire | null }> {
  if (!listingId) return { reviews: [], summary: null };

  try {
    const url = makeApiUrl(
      `/api/reviews/list?listingId=${encodeURIComponent(listingId)}&listingType=product&page=1&pageSize=10`,
    );

    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    const json = ((await res.json().catch(() => ({}))) || {}) as any;

    if (!res.ok) return { reviews: [], summary: null };

    const itemsRaw = Array.isArray(json.items) ? json.items : Array.isArray(json.reviews) ? json.reviews : [];
    const reviews = itemsRaw as ClientReviewWire[];

    const summaryFromJson =
      (json.summary as ClientReviewSummaryWire | undefined) ??
      (json.meta?.summary as ClientReviewSummaryWire | undefined) ??
      null;

    let summary: ClientReviewSummaryWire | null = summaryFromJson || null;

    if (!summary && json.stats) {
      const stats = json.stats as { average?: number | null; count?: number | null };
      summary = {
        average: typeof stats.average === "number" && Number.isFinite(stats.average) ? stats.average : null,
        count: typeof stats.count === "number" && Number.isFinite(stats.count) ? stats.count : null,
        breakdown: null,
      };
    }

    return { reviews, summary };
  } catch {
    return { reviews: [], summary: null };
  }
}

/* ----------------------------- Metadata (SEO) ----------------------------- */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const cleanId = String(id || "").trim();

  const canonical = cleanId ? `/product/${encodeURIComponent(cleanId)}` : "/product";

  if (!cleanId) {
    return {
      title: "Product",
      alternates: { canonical },
      robots: { index: false, follow: false, nocache: true },
    };
  }

  const { product, status } = await fetchInitialProduct(cleanId);

  if (!product || status === 404) {
    return {
      title: "Product not found",
      alternates: { canonical },
      robots: { index: false, follow: false, nocache: true },
    };
  }

  if (!isActiveListing(product)) {
    return {
      title: "Product unavailable",
      alternates: { canonical },
      robots: { index: false, follow: false, nocache: true },
    };
  }

  const name = (product as any)?.name || "Product";
  const priceText = fmtKES((product as any)?.price);
  const locationText = (product as any)?.location || "";

  return {
    title: String(name),
    description: [String(name), priceText, locationText].filter(Boolean).join(" • ").slice(0, 155),
    alternates: { canonical },
    robots: { index: true, follow: true },
  };
}

/* -------------------------------- Page --------------------------------- */

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cleanId = String(id || "").trim();
  if (!cleanId) notFound();

  const [{ product, status }, { reviews, summary }] = await Promise.all([
    fetchInitialProduct(cleanId),
    fetchInitialReviews(cleanId),
  ]);

  if (status === 404 || !product) notFound();
  if (!isActiveListing(product)) notFound();

  const storeGeo = resolveStoreGeoFromProduct(product);

  const enrichedProduct = storeGeo
    ? (({
        ...(product as any),
        storeLat: storeGeo.lat,
        storeLng: storeGeo.lng,
        storeGeoSource: storeGeo.source,
      } as unknown) as ClientProductWire)
    : product;

  const title = enrichedProduct.name || "Product";

  return (
    <main className="container-page space-y-4 py-4 sm:space-y-6 sm:py-6">
      <header className="flex flex-col gap-2 sm:gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Product
          </p>
          <h1 className="mt-1 truncate text-xl font-extrabold tracking-tight text-[var(--text)] sm:text-2xl">
            {title}
          </h1>
          <span className="sr-only" data-testid="product-id">
            {cleanId}
          </span>
        </div>
      </header>

      <ProductPageClient
        id={cleanId}
        initialData={enrichedProduct}
        initialReviews={reviews}
        initialReviewSummary={summary}
      />
    </main>
  );
}
