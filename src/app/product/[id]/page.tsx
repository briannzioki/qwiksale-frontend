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
      // Fallback: try the bulk endpoint as a secondary source
      const alt = await fetch(
        makeApiUrl(`/api/products?ids=${encodeURIComponent(id)}`),
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
        },
      ).catch(() => null);

      const altJson = ((await alt?.json().catch(() => null)) as any) || {};

      const cand = Array.isArray(altJson?.items)
        ? (altJson.items.find((x: any) => String(x?.id) === String(id)) as
            | ClientProductWire
            | undefined)
        : null;

      if (cand) {
        return { product: cand, status: 200 };
      }

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
): Promise<{
  reviews: ClientReviewWire[];
  summary: ClientReviewSummaryWire | null;
}> {
  if (!listingId) {
    return { reviews: [], summary: null };
  }

  try {
    const url = makeApiUrl(
      `/api/reviews/list?listingId=${encodeURIComponent(listingId)}&listingType=product&page=1&pageSize=10`,
    );

    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    const json = ((await res.json().catch(() => ({}))) || {}) as any;

    if (!res.ok) {
      // Reviews must never break the product page
      return { reviews: [], summary: null };
    }

    const itemsRaw = Array.isArray(json.items)
      ? json.items
      : Array.isArray(json.reviews)
        ? json.reviews
        : [];

    const reviews = itemsRaw as ClientReviewWire[];

    // Prefer explicit summary/meta.summary if present (for future compatibility)
    const summaryFromJson =
      (json.summary as ClientReviewSummaryWire | undefined) ??
      (json.meta?.summary as ClientReviewSummaryWire | undefined) ??
      null;

    let summary: ClientReviewSummaryWire | null = summaryFromJson || null;

    // Fallback to new `stats` shape from the reviews API
    if (!summary && json.stats) {
      const stats = json.stats as {
        average?: number | null;
        count?: number | null;
      };

      summary = {
        average:
          typeof stats.average === "number" && Number.isFinite(stats.average)
            ? stats.average
            : null,
        count:
          typeof stats.count === "number" && Number.isFinite(stats.count)
            ? stats.count
            : null,
        breakdown: null,
      };
    }

    return {
      reviews,
      summary,
    };
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

  const canonical = cleanId
    ? `/product/${encodeURIComponent(cleanId)}`
    : "/product";

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

  // ✅ prevent “soft 404”: inactive listings should be noindex and 404 at page render
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
    description: [String(name), priceText, locationText]
      .filter(Boolean)
      .join(" • ")
      .slice(0, 155),
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

  // ✅ prevent “soft 404”: inactive listings must be real 404
  if (!isActiveListing(product)) notFound();

  const title = product.name || "Product";
  const priceText = fmtKES(product.price);
  const locationText = product.location || null;

  return (
    <main className="container-page space-y-4 py-4 sm:space-y-6 sm:py-6">
      {/* Header (SSR, stable for SEO & tests) */}
      <header className="flex flex-col gap-2 sm:gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Product
          </p>
          {/* Keep “Product” conceptually for tests looking for Product/Item/Listing */}
          <h1 className="mt-1 text-xl font-extrabold tracking-tight text-[var(--text)] sm:text-2xl">
            {title}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)] sm:mt-3 sm:gap-3 sm:text-sm">
            <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 text-xs font-semibold text-[var(--text)] sm:px-3 sm:text-sm">
              {priceText}
            </span>

            {locationText && (
              <span className="inline-flex items-center gap-1">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]"
                  aria-hidden="true"
                />
                <span className="text-[var(--text-muted)]">{locationText}</span>
              </span>
            )}

            {/* Keep ID for tests but hide it visually */}
            <span className="sr-only" data-testid="product-id">
              {cleanId}
            </span>
          </div>
        </div>
      </header>

      {/* Client-side detail + gallery + seller + reviews */}
      <ProductPageClient
        id={cleanId}
        initialData={product}
        initialReviews={reviews}
        initialReviewSummary={summary}
      />
    </main>
  );
}
