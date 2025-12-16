"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import toast from "react-hot-toast";

import { useProducts } from "@/app/lib/productsStore";
import FavoriteButton from "@/app/components/favorites/FavoriteButton";
import DeleteListingButton from "@/app/components/DeleteListingButton";
import { buildProductSeo } from "@/app/lib/seo";
import Gallery from "@/app/components/Gallery";
import ContactModal from "@/app/components/ContactModal";
import { extractGalleryUrls } from "@/app/lib/media";

import ReviewSummary from "@/app/components/ReviewSummary";
import { ReviewList } from "@/app/components/ReviewList";
import { AddReviewForm } from "@/app/components/AddReviewForm";
import { useListingReviews } from "@/app/hooks/useListingReviews";
import SellerInfo from "@/app/components/SellerInfo";

import type { Review, ReviewListResponse, ReviewBreakdown } from "@/app/lib/reviews";

/* -------------------------------- Types -------------------------------- */

type FeaturedTier = "basic" | "gold" | "diamond";

export type ProductWire = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;
  brand?: string | null;
  condition?: string | null;
  price?: number | null;
  image?: string | null;
  gallery?: string[];
  location?: string | null;
  negotiable?: boolean;
  featured?: boolean;
  status?: string | null;
  sellerId?: string | null;
  sellerName?: string | null;
  sellerPhone?: string | null;
  sellerLocation?: string | null;
  sellerMemberSince?: string | null;
  sellerRating?: number | null;
  sellerSales?: number | null;

  /** Seller/account flags */
  sellerVerified?: boolean | null;
  sellerFeaturedTier?: FeaturedTier | null;

  /** New-ish fields coming from API */
  sellerStoreLocationUrl?: string | null;
  seller?:
    | {
        id?: string;
        username?: string | null;
        name?: string | null;
        image?: string | null;
        phone?: string | null;
        location?: string | null;
        memberSince?: string | null;
        rating?: number | null;
        sales?: number | null;
        verified?: boolean | null;
        storeLocationUrl?: string | null;

        featuredTier?: FeaturedTier | string | null;
        featured_tier?: string | null;
        tier?: string | null;
      }
    | null;
  sellerUsername?: string | null;
  username?: string | null;
};

type StoreRow =
  ReturnType<typeof useProducts> extends { products: infer U }
    ? U extends (infer V)[]
      ? V
      : never
    : never;

type Detail = Partial<StoreRow> & ProductWire;

export type ReviewSummaryWire = {
  average?: number | null;
  count?: number | null;
  /** Wire format from API: keyed by string "1".."5" etc. */
  breakdown?: Record<string, number> | null;
};

/** Alias to the shared Review model so everything is consistent. */
export type ReviewWire = Review;

/* ------------------------------ Constants ------------------------------ */

const GALLERY_SIZES = "(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 800px";

/* ------------------------------ Utilities ------------------------------ */

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || n <= 0) return "Contact for price";
  try {
    return `KES ${new Intl.NumberFormat("en-KE").format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

function pickFirstBool(...xs: unknown[]): boolean | null {
  for (const x of xs) {
    if (typeof x === "boolean") return x;
  }
  return null;
}

function coerceFeaturedTier(v: unknown): FeaturedTier | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("diamond")) return "diamond";
  if (s.includes("gold")) return "gold";
  if (s.includes("basic")) return "basic";
  return null;
}

/**
 * Keep store slugs compatible with src/app/store/[username]/page.tsx:
 * - username must match /^[a-z0-9._-]{2,128}$/i
 * - otherwise always fall back to u-<userId>
 */
function normalizeStoreHandle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let s = raw.trim();
  if (!s) return "";
  try {
    s = decodeURIComponent(s);
  } catch {
    // ignore
  }
  s = s.trim().replace(/^@+/, "");
  return s;
}

function isStoreCodeToken(raw: unknown): boolean {
  const s = normalizeStoreHandle(raw);
  if (!s) return false;
  const lower = s.toLowerCase();
  if (lower === "undefined" || lower === "null" || lower === "nan") return false;
  if (/^(?:sto|store)[-_]?\d{1,18}$/i.test(s)) return true;
  if (/^\d{1,18}$/.test(s)) return true;
  return false;
}

function coerceValidStoreUsername(raw: unknown): string | null {
  const s = normalizeStoreHandle(raw);
  if (!s) return null;

  // ✅ critical: reject store-code-ish tokens like Sto-83535/store-83535/83535
  if (isStoreCodeToken(s)) return null;

  return /^[a-z0-9._-]{2,128}$/i.test(s) ? s : null;
}

function coerceValidUserId(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === "undefined" || lower === "null" || lower === "nan") return null;

  // ✅ critical: do not treat store codes as user ids
  if (isStoreCodeToken(s)) return null;

  if (s.length > 120) return null;
  return s;
}

function SellerBadgesRow({
  verified,
  tier,
}: {
  verified?: boolean | null;
  tier?: FeaturedTier | null;
}) {
  const showVerified = typeof verified === "boolean";
  const showTier = !!tier;
  if (!showVerified && !showTier) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {showVerified ? (
        verified ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200">
            <span aria-hidden>✓</span>
            <span>Verified</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
            <span aria-hidden>!</span>
            <span>Unverified</span>
          </span>
        )
      ) : null}

      {tier ? (
        tier === "gold" ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-yellow-300 bg-gradient-to-r from-yellow-200 via-yellow-100 to-yellow-300 px-2 py-0.5 text-[11px] font-semibold text-yellow-950 dark:border-yellow-900/40 dark:from-yellow-900/30 dark:via-yellow-900/10 dark:to-yellow-900/30 dark:text-yellow-100">
            <span aria-hidden>★</span>
            <span>Featured Gold</span>
          </span>
        ) : tier === "diamond" ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-gradient-to-r from-sky-200 via-indigo-100 to-violet-200 px-2 py-0.5 text-[11px] font-semibold text-slate-950 dark:border-indigo-900/40 dark:from-indigo-900/30 dark:via-indigo-900/10 dark:to-indigo-900/30 dark:text-slate-100">
            <span aria-hidden>💎</span>
            <span>Featured Diamond</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">
            <span aria-hidden>★</span>
            <span>Featured Basic</span>
          </span>
        )
      ) : null}
    </div>
  );
}

/**
 * Normalize any raw review shape coming from API/store into a safe Review.
 * Avoids assigning explicit `undefined` to optional fields (exactOptionalPropertyTypes).
 */
function normalizeReview(raw: any): Review {
  if (!raw || typeof raw !== "object") {
    return {
      id: `tmp-${Math.random().toString(36).slice(2)}`,
      rating: 0,
      text: "",
    } as Review;
  }

  const id =
    (raw as any).id != null
      ? String((raw as any).id)
      : `tmp-${Math.random().toString(36).slice(2)}`;

  const rating = Number((raw as any).rating ?? 0) || 0;

  const result: Review = {
    id,
    rating,
  };

  if ("text" in raw) {
    (result as any).text = (raw as any).text ?? "";
  }

  const createdAtRaw = (raw as any).createdAt;
  if (typeof createdAtRaw === "string" || createdAtRaw instanceof Date) {
    (result as any).createdAt = createdAtRaw;
  }

  const listingIdRaw = (raw as any).listingId;
  if (listingIdRaw != null) {
    (result as any).listingId = String(listingIdRaw);
  }

  const raterIdRaw = (raw as any).raterId;
  if (raterIdRaw != null) {
    (result as any).raterId = String(raterIdRaw);
  }

  if ("viewerOwn" in raw) {
    (result as any).viewerOwn = Boolean((raw as any).viewerOwn);
  }

  if ("rater" in raw) {
    (result as any).rater = (raw as any).rater ?? null;
  }

  return result;
}

/* --------------------------------- UI ---------------------------------- */

export default function ProductPageClient({
  id,
  initialData,
  initialReviews,
  initialReviewSummary,
}: {
  id: string;
  initialData: ProductWire | null;
  initialReviews?: ReviewWire[] | null;
  initialReviewSummary?: ReviewSummaryWire | null;
}) {
  const { data: session } = useSession();
  const { products } = useProducts();

  /* ------------------ Seed initial reviews into the hook ----------------- */

  const normalizedInitialReviews = useMemo<Review[]>(
    () => (Array.isArray(initialReviews) ? initialReviews.map(normalizeReview) : []),
    [initialReviews],
  );

  const initialSummaryFromProps = useMemo<ReviewSummaryWire | null>(
    () =>
      initialReviewSummary
        ? {
            average: initialReviewSummary.average ?? null,
            count: initialReviewSummary.count ?? (normalizedInitialReviews?.length ?? 0),
            breakdown: initialReviewSummary.breakdown ?? null,
          }
        : null,
    [initialReviewSummary, normalizedInitialReviews],
  );

  const initialReviewData = useMemo<ReviewListResponse | null>(() => {
    if (!normalizedInitialReviews.length && !initialSummaryFromProps) {
      return null;
    }

    const fallbackCount = initialSummaryFromProps?.count ?? normalizedInitialReviews.length;

    const fallbackAverage =
      initialSummaryFromProps?.average ??
      (normalizedInitialReviews.length
        ? normalizedInitialReviews.reduce(
            (acc, r) => acc + (typeof r.rating === "number" ? r.rating : 0),
            0,
          ) / normalizedInitialReviews.length
        : 0);

    let breakdown: ReviewBreakdown | undefined;
    const wireBreakdown = initialSummaryFromProps?.breakdown;
    if (wireBreakdown && typeof wireBreakdown === "object") {
      const dist: ReviewBreakdown = {};
      for (const [key, value] of Object.entries(wireBreakdown)) {
        const star = Number(key);
        const count = Number(value);
        if (!Number.isFinite(star) || star <= 0 || star > 5) continue;
        if (!Number.isFinite(count) || count <= 0) continue;
        dist[star] = count;
      }
      if (Object.keys(dist).length) breakdown = dist;
    }

    return {
      page: 1,
      pageSize: normalizedInitialReviews.length || 10,
      total: fallbackCount,
      totalPages: 1,
      items: normalizedInitialReviews,
      summary: {
        average: fallbackAverage,
        count: fallbackCount,
        ...(breakdown ? { breakdown } : {}),
      },
    };
  }, [normalizedInitialReviews, initialSummaryFromProps]);

  const {
    reviews: hookReviews,
    summary: hookSummary,
    average: hookAverage,
    count: hookCount,
    loading: reviewLoading,
    error: reviewErr,
    onReviewCreated,
  } = useListingReviews({
    listingId: id,
    listingType: "product",
    initialData: initialReviewData,
  });

  const reviews: ReviewWire[] = useMemo(() => hookReviews.map(normalizeReview), [hookReviews]);

  const reviewSummary = useMemo(
    () =>
      hookSummary
        ? {
            average: hookSummary.average,
            count: hookSummary.count,
            breakdown: hookSummary.breakdown ?? null,
          }
        : reviews.length
          ? {
              average:
                reviews.reduce((acc, r) => {
                  const v = typeof r.rating === "number" ? r.rating : 0;
                  return acc + v;
                }, 0) / reviews.length,
              count: reviews.length,
              breakdown: null,
            }
          : null,
    [hookSummary, reviews],
  );

  /* ------------------------- Product detail state ------------------------ */

  const [fetched, setFetched] = useState<Detail | null>((initialData as unknown as Detail) ?? null);
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [gone, setGone] = useState(false);

  const product = useMemo(() => {
    if (!id) return undefined;
    const p = products.find((x: any) => String(x.id) === String(id)) as StoreRow | undefined;
    return (p as Detail) || undefined;
  }, [products, id]);

  useEffect(() => {
    if (!id || fetching || fetched) return;
    let cancelled = false;

    (async () => {
      try {
        setFetching(true);
        setFetchErr(null);
        const r = await fetch(`/api/products/${encodeURIComponent(id)}`, {
          cache: "no-store",
          credentials: "include",
          headers: { Accept: "application/json" },
        });

        if (r.status === 404) {
          if (!cancelled) setGone(true);
          return;
        }
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || `Failed to load (${r.status})`);

        const maybe = (j && (("product" in j ? (j as any).product : j) as Detail)) || null;
        const status = (maybe as any)?.status;

        if (status && String(status).toUpperCase() !== "ACTIVE") {
          if (!cancelled) setGone(true);
          return;
        }

        if (!cancelled) {
          setFetched(maybe);
          setGone(false);
        }
      } catch (e: any) {
        if (!cancelled) setFetchErr(e?.message || "Failed to load product");
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, fetching, fetched]);

  useEffect(() => {
    const status = (product as any)?.status;
    if (status && String(status).toUpperCase() !== "ACTIVE") {
      setGone(true);
    }
  }, [product]);

  if (gone) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 grid h-10 w-10 place-content-center rounded-lg bg-[#161748] text-white">
            404
          </div>
          <h1 className="text-lg font-semibold">Listing unavailable</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This product was removed or isn’t available anymore.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Link href="/" prefetch={false} className="btn-gradient-primary">
              Home
            </Link>
            <Link href="/search" prefetch={false} className="btn-gradient-primary">
              Browse more
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const displayMaybe = (fetched || product) as Detail | undefined;

  const sellerVerifiedRaw =
    typeof (displayMaybe as any)?.sellerVerified === "boolean"
      ? (displayMaybe as any).sellerVerified
      : typeof (displayMaybe as any)?.verified === "boolean"
        ? (displayMaybe as any).verified
        : undefined;

  const sellerTierRaw =
    coerceFeaturedTier((displayMaybe as any)?.sellerFeaturedTier) ??
    coerceFeaturedTier((displayMaybe as any)?.seller_featured_tier) ??
    coerceFeaturedTier((displayMaybe as any)?.featuredTier) ??
    coerceFeaturedTier((displayMaybe as any)?.featured_tier) ??
    null;

  const display: Detail = {
    id: displayMaybe?.id ?? (id || "unknown"),
    name: displayMaybe?.name ?? "Listing",
    category: displayMaybe?.category ?? "General",
    subcategory: displayMaybe?.subcategory ?? "General",
    description: displayMaybe?.description ?? null,
    brand: displayMaybe?.brand ?? null,
    condition: displayMaybe?.condition ?? null,
    price: typeof displayMaybe?.price === "number" ? displayMaybe?.price : null,
    image: displayMaybe?.image ?? null,
    gallery: Array.isArray(displayMaybe?.gallery) ? displayMaybe!.gallery : [],
    location: displayMaybe?.location ?? null,
    negotiable: Boolean(displayMaybe?.negotiable),
    featured: Boolean(displayMaybe?.featured),
    sellerId: displayMaybe?.sellerId ?? null,
    sellerName: displayMaybe?.sellerName ?? null,
    sellerPhone: displayMaybe?.sellerPhone ?? null,
    sellerLocation: displayMaybe?.sellerLocation ?? null,
    sellerMemberSince: displayMaybe?.sellerMemberSince ?? null,
    sellerRating: typeof displayMaybe?.sellerRating === "number" ? displayMaybe?.sellerRating : null,
    sellerSales: typeof displayMaybe?.sellerSales === "number" ? displayMaybe?.sellerSales : null,
    seller: displayMaybe?.seller ?? null,
    status: displayMaybe?.status ?? null,

    // ✅ stable defaults so badges don’t disappear on partial data
    sellerVerified: typeof sellerVerifiedRaw === "boolean" ? sellerVerifiedRaw : false,
    sellerFeaturedTier: sellerTierRaw ?? "basic",

    sellerStoreLocationUrl:
      (displayMaybe as any)?.sellerStoreLocationUrl ??
      (displayMaybe as any)?.storeLocationUrl ??
      null,
    sellerUsername: displayMaybe?.sellerUsername ?? null,
    username: displayMaybe?.username ?? null,
  };

  const apiGallery = useMemo(
    () => extractGalleryUrls(displayMaybe ?? {}, displayMaybe?.image || "/og.png"),
    [displayMaybe],
  );

  const enableLightbox = apiGallery.length > 0;

  const seller = useMemo(() => {
    const nested: any = (display as any)?.seller || {};
    const username =
      [nested?.username, (display as any)?.sellerUsername, (display as any)?.username]
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .find(Boolean) || null;

    const storeLocationUrl =
      typeof nested?.storeLocationUrl === "string"
        ? nested.storeLocationUrl
        : typeof (display as any)?.sellerStoreLocationUrl === "string"
          ? (display as any).sellerStoreLocationUrl
          : typeof (display as any)?.storeLocationUrl === "string"
            ? (display as any).storeLocationUrl
            : null;

    const verified =
      pickFirstBool(
        nested?.verified,
        nested?.isVerified,
        (display as any)?.sellerVerified,
        (display as any)?.verified,
      ) ?? false;

    const featuredTier: FeaturedTier =
      coerceFeaturedTier(nested?.featuredTier) ??
      coerceFeaturedTier(nested?.featured_tier) ??
      coerceFeaturedTier(nested?.tier) ??
      coerceFeaturedTier((display as any)?.sellerFeaturedTier) ??
      "basic";

    return {
      id: nested?.id ?? display?.sellerId ?? null,
      username,
      name: nested?.name ?? display?.sellerName ?? "Private Seller",
      image: nested?.image ?? null,
      phone: nested?.phone ?? display?.sellerPhone ?? null,
      location: nested?.location ?? display?.sellerLocation ?? null,
      memberSince: nested?.memberSince ?? display?.sellerMemberSince ?? null,
      rating:
        typeof nested?.rating === "number"
          ? nested.rating
          : typeof display?.sellerRating === "number"
            ? display?.sellerRating
            : null,
      sales:
        typeof nested?.sales === "number"
          ? nested.sales
          : typeof display?.sellerSales === "number"
            ? display?.sellerSales
            : null,
      storeLocationUrl,
      verified,
      featuredTier,
    };
  }, [display]);

  // ✅ compute a *real* seller user id for ownership + store links (never Sto-xxxxx)
  const sellerUserIdForStore = useMemo(() => {
    const nestedId = (display as any)?.seller?.id;
    const candidates = [nestedId, seller.id, display.sellerId];
    for (const c of candidates) {
      const v = coerceValidUserId(c);
      if (v) return v;
    }
    return null;
  }, [display, seller.id, display.sellerId]);

  const isOwner =
    Boolean((session?.user as any)?.id) &&
    Boolean(sellerUserIdForStore) &&
    (session?.user as any)?.id === sellerUserIdForStore;

  /* -------------------------- Sharing / SEO etc ------------------------- */

  const [fetchCopying, setFetchCopying] = useState(false);

  const copyLink = useCallback(async () => {
    if (!display?.id || fetchCopying) return;
    try {
      setFetchCopying(true);
      const shareUrl =
        typeof window !== "undefined" && window.location
          ? `${window.location.origin}/product/${display.id}`
          : `/product/${display.id}`;
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy link");
    } finally {
      setFetchCopying(false);
    }
  }, [display?.id, fetchCopying]);

  const seo = useMemo(() => {
    const nonPlaceholder = apiGallery.length > 0 ? apiGallery : display.image ? [display.image] : [];
    const args: Parameters<typeof buildProductSeo>[0] = {
      id: display.id!,
      name: display.name!,
      ...(display.description != null ? { description: display.description } : {}),
      ...(typeof display.price === "number" ? { price: display.price as number | null } : {}),
      ...(nonPlaceholder.length ? { image: nonPlaceholder } : {}),
      ...(display.brand ? { brand: display.brand } : {}),
      ...(display.category ? { category: display.category } : {}),
      ...(display.condition ? { condition: display.condition } : {}),
      status: "ACTIVE",
      urlPath: `/product/${display.id}`,
    };
    return buildProductSeo(args);
  }, [display, apiGallery]);

  // ✅ FIX: prefer a VALID username handle; otherwise fall back to u-<real user id>.
  // Never allow store-code-ish tokens like Sto-83535 to become the store slug.
  const storeSlug = useMemo(() => {
    const uname =
      coerceValidStoreUsername(seller.username) ??
      coerceValidStoreUsername(display.sellerUsername) ??
      coerceValidStoreUsername(display.username);

    if (uname) return uname;

    const uid = sellerUserIdForStore;
    return uid ? `u-${uid}` : null;
  }, [seller.username, display.sellerUsername, display.username, sellerUserIdForStore]);

  const storeHref = useMemo(() => {
    if (!storeSlug) return null;
    return `/store/${encodeURIComponent(storeSlug)}`;
  }, [storeSlug]);

  const sellerIdForDonate: string | null = sellerUserIdForStore;

  /* -------------------------------- Render ------------------------------ */

  return (
    <>
      {seo?.jsonLd && (
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(seo.jsonLd),
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Media */}
        <div className="lg:col-span-3">
          <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm" data-gallery-wrap>
            {/* ✅ no aspect-[…] utilities */}
            <div className="relative" style={{ aspectRatio: "16 / 10" }}>
              {display.featured && (
                <span className="absolute left-3 top-3 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs text-white shadow">
                  Featured
                </span>
              )}

              <Gallery images={apiGallery} lightbox={enableLightbox} sizes={GALLERY_SIZES} />

              <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-black/5 dark:ring-white/10" />
            </div>

            {/* Controls */}
            <div className="absolute right-3 top-3 z-20 flex gap-2">
              <button
                onClick={copyLink}
                className="btn-gradient-primary inline-flex items-center gap-1 px-2 py-1 text-xs"
                title="Copy link"
                aria-label="Copy link"
                disabled={fetchCopying}
              >
                {fetchCopying ? "Copying…" : "Copy"}
              </button>

              {display?.id && (
                <>
                  <FavoriteButton productId={display.id!} />
                  {isOwner && (
                    <>
                      <Link
                        href={`/product/${display.id}/edit`}
                        className="btn-gradient-primary inline-flex items-center gap-1 px-2 py-1 text-xs"
                        title="Edit listing"
                        aria-label="Edit listing"
                      >
                        Edit
                      </Link>
                      <DeleteListingButton
                        productId={display.id!}
                        productName={display.name!}
                        label="Delete"
                        buttonSize="sm"
                        buttonVariant="solid"
                        buttonTone="danger"
                        redirectHref="/dashboard?deleted=1"
                      />
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4 lg:col-span-2">
          {/* Title / meta */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{display.name || "Listing"}</h1>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {display.category || "General"} • {display.subcategory || "General"}
                </span>
                {display.featured && (
                  <span className="whitespace-nowrap rounded-full bg-[#161748] px-3 py-1 text-xs font-medium text-white">
                    Featured listing
                  </span>
                )}
              </div>
              {(fetching || fetchErr) && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {fetching ? "Loading details…" : "Showing limited info"}
                </div>
              )}
            </div>
          </div>

          {/* Price / attributes */}
          <div className="space-y-1 rounded-xl border border-border bg-card p-4">
            <p className="text-2xl font-bold text-[#161748] dark:text-brandBlue">{fmtKES(display.price)}</p>
            {display.negotiable && <p className="text-sm text-muted-foreground">Negotiable</p>}
            {display.brand && <p className="text-sm text-muted-foreground">Brand: {display.brand}</p>}
            {display.condition && <p className="text-sm text-muted-foreground">Condition: {display.condition}</p>}
            {display.location && <p className="text-sm text-muted-foreground">Location: {display.location}</p>}
          </div>

          {/* Description */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-2 font-semibold">Description</h2>
            <p className="whitespace-pre-line text-foreground">{display.description || "No description provided."}</p>
          </div>

          {/* Seller badges + Seller panel (shared) */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-sm font-semibold text-foreground">Seller</div>

            {/* ✅ always present now (defaults applied upstream) */}
            <SellerBadgesRow verified={seller.verified} tier={seller.featuredTier} />

            <div className="mt-3">
              <SellerInfo
                label="Seller"
                sellerId={sellerUserIdForStore}
                username={seller.username ?? null}
                name={seller.name ?? null}
                avatarUrl={seller.image ?? null}
                locationLabel={seller.location ?? display.location ?? null}
                storeLocationUrl={seller.storeLocationUrl ?? display.sellerStoreLocationUrl ?? null}
                memberSince={seller.memberSince ?? null}
                rating={typeof seller.rating === "number" ? seller.rating : null}
                salesCount={typeof seller.sales === "number" ? seller.sales : null}
                verified={seller.verified}
                storeHref={storeHref}
                donateSellerId={sellerIdForDonate}
                contactSlot={
                  display.id ? (
                    <ContactModal
                      className="btn-gradient-primary"
                      productId={display.id!}
                      productName={display.name!}
                      fallbackName={seller.name}
                      fallbackLocation={seller.location}
                      buttonLabel="Message seller"
                    />
                  ) : null
                }
              />
            </div>
          </div>

          {/* Reviews */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">Reviews</h3>
              {reviewSummary && reviewSummary.count ? (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">{(reviewSummary.average ?? 0).toFixed(1)} / 5</span>{" "}
                  · {reviewSummary.count} {reviewSummary.count === 1 ? "review" : "reviews"}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">No reviews yet</div>
              )}
            </div>

            <div className="mt-3 space-y-3">
              {reviewErr && <p className="text-xs text-red-500">{reviewErr}</p>}

              {reviewLoading && reviews.length === 0 ? (
                <p className="text-xs text-muted-foreground">Loading reviews…</p>
              ) : null}

              <ReviewSummary
                average={hookAverage}
                count={hookCount}
                {...(hookSummary?.breakdown ? { breakdown: hookSummary.breakdown } : {})}
                size="md"
              />

              <ReviewList reviews={reviews} />

              {display?.id && (
                <AddReviewForm listingId={display.id!} listingType="product" onSubmittedAction={onReviewCreated} />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
