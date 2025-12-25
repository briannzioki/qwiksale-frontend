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
import type { FeaturedTier } from "@/app/lib/sellerVerification";
import {
  buildSellerBadgeFields,
  resolveSellerBadgeFieldsFromUserLike,
} from "@/app/lib/sellerVerification";

/* -------------------------------- Types -------------------------------- */

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
  sellerBadges?: { verified?: boolean | null; tier?: FeaturedTier | string | null } | null;

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

        // NOTE: not authoritative for badges in UI
        verified?: boolean | null;
        storeLocationUrl?: string | null;

        featuredTier?: FeaturedTier | string | null;
        featured_tier?: string | null;
        tier?: string | null;

        // NextAuth-ish / legacy-ish keys that may appear
        emailVerified?: unknown;
        email_verified?: unknown;
        emailVerifiedAt?: unknown;
        email_verified_at?: unknown;
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

function normalizeTier(v: unknown): FeaturedTier | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  return t === "basic" || t === "gold" || t === "diamond" ? (t as FeaturedTier) : null;
}

/**
 * Seller badges must be derived via shared resolver (emailVerified-only verification),
 * BUT we allow the API's explicit derived fields:
 * - sellerBadges.verified
 * - sellerVerified
 *
 * We do NOT trust legacy/random boolean fields on nested seller objects (e.g. seller.verified).
 */
function resolveSellerBadgeFieldsFromAny(raw: any) {
  const seller =
    raw?.seller && typeof raw.seller === "object" && !Array.isArray(raw.seller)
      ? raw.seller
      : null;

  const base = seller ?? (raw && typeof raw === "object" ? raw : {});

  // Tier can exist at multiple levels; it's NOT verification.
  const tierHint =
    raw?.sellerFeaturedTier ??
    raw?.seller_featured_tier ??
    raw?.sellerBadges?.tier ??
    raw?.featuredTier ??
    raw?.featured_tier ??
    null;

  // ✅ Only accept the API's explicit derived verification fields (not nested legacy booleans).
  const verifiedHint =
    typeof raw?.sellerBadges?.verified === "boolean"
      ? raw.sellerBadges.verified
      : typeof raw?.sellerVerified === "boolean"
        ? raw.sellerVerified
        : typeof raw?.seller_verified === "boolean"
          ? raw.seller_verified
          : null;

  // ✅ Prevent legacy boolean fields from influencing badge resolution.
  const baseClean: any = { ...(base as any) };
  delete baseClean.verified;
  delete baseClean.isVerified;
  delete baseClean.accountVerified;
  delete baseClean.sellerVerified;
  delete baseClean.isSellerVerified;
  delete baseClean.verifiedSeller;
  delete baseClean.isAccountVerified;
  delete baseClean.verifiedAt;
  delete baseClean.verified_on;
  delete baseClean.verifiedOn;
  delete baseClean.verificationDate;

  const userLike = tierHint != null ? { ...baseClean, featuredTier: tierHint } : baseClean;

  const resolved = resolveSellerBadgeFieldsFromUserLike(userLike);

  const finalVerified = typeof verifiedHint === "boolean" ? verifiedHint : resolved.sellerVerified;

  return buildSellerBadgeFields(finalVerified, resolved.sellerFeaturedTier);
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
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 text-center text-[var(--text)] shadow-soft sm:p-6">
          <div className="mx-auto mb-2 grid h-9 w-9 place-content-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text)] sm:mb-3 sm:h-10 sm:w-10">
            404
          </div>
          <h1 className="text-lg font-semibold text-[var(--text)]">Listing unavailable</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
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

  // ✅ seller verification from emailVerified-only resolver + explicit API derived fields
  const sellerBadgeFields = resolveSellerBadgeFieldsFromAny(displayMaybe);

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

    // ✅ stable consolidated badges + alias fields
    ...sellerBadgeFields,

    sellerStoreLocationUrl:
      (displayMaybe as any)?.sellerStoreLocationUrl ?? (displayMaybe as any)?.storeLocationUrl ?? null,
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

    // ✅ UI must trust display.sellerVerified / display.sellerFeaturedTier (resolver-derived / API derived)
    const uiVerified =
      typeof (display as any)?.sellerVerified === "boolean" ? (display as any).sellerVerified : null;

    const uiTier = normalizeTier((display as any)?.sellerFeaturedTier);

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

      // ✅ ONLY resolver/API-derived fields reach UI badges/props
      verified: uiVerified,
      featuredTier: uiTier,
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

  // ✅ Tier should be shown whenever a valid tier exists; keep "basic" fallback for featured listings.
  const listingTier: FeaturedTier | null = seller.featuredTier ?? (display.featured ? "basic" : null);

  // Gallery featured overlay (icon-only + tier-colored)
  const overlayTier: FeaturedTier | null = listingTier;
  const overlayTestId = overlayTier ? `featured-tier-${overlayTier}` : null;
  const overlayLabel = overlayTier ? `Featured tier ${overlayTier}` : "";
  const overlayIcon = overlayTier === "diamond" ? "💎" : "★";

  const toneTier: FeaturedTier = overlayTier ?? "basic";

  const featuredOverlayClass =
    toneTier === "diamond"
      ? "border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)]"
      : toneTier === "gold"
        ? "border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text)]"
        : "border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)]";

  const featuredOverlayRing = "ring-1 ring-[var(--border-subtle)]";

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

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-5">
        {/* Media */}
        <div className="lg:col-span-3">
          <div
            className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-soft"
            data-gallery-wrap
          >
            {/* ✅ no aspect-[…] utilities */}
            <div className="relative" style={{ aspectRatio: "16 / 10" }}>
              {overlayTier && overlayTestId && (
                <span
                  data-testid={overlayTestId}
                  aria-label={overlayLabel}
                  title={overlayLabel}
                  className={[
                    "pointer-events-none absolute left-2 top-2 z-20 inline-flex items-center justify-center rounded-xl px-2 py-1 text-[11px] shadow-sm sm:left-3 sm:top-3 sm:text-xs",
                    featuredOverlayClass,
                    featuredOverlayRing,
                  ].join(" ")}
                >
                  <span aria-hidden>{overlayIcon}</span>
                </span>
              )}

              <Gallery images={apiGallery} lightbox={enableLightbox} sizes={GALLERY_SIZES} />

              <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-[var(--border-subtle)]" />
            </div>

            {/* Controls */}
            <div className="absolute right-2 top-2 z-20 flex gap-2 sm:right-3 sm:top-3">
              <button
                onClick={copyLink}
                className="btn-gradient-primary inline-flex h-9 items-center gap-1 px-3 text-xs"
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
                        className="btn-gradient-primary inline-flex h-9 items-center gap-1 px-3 text-xs"
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
        <div className="space-y-3 sm:space-y-4 lg:col-span-2">
          {/* Title / meta */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-[var(--text)] sm:text-2xl">
                {display.name || "Listing"}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-xs text-[var(--text-muted)] sm:text-sm">
                  {display.category || "General"} • {display.subcategory || "General"}
                </span>
                {display.featured && (
                  <span className="whitespace-nowrap rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px] font-medium text-[var(--text)] sm:px-3 sm:py-1 sm:text-xs">
                    Featured listing
                  </span>
                )}
              </div>
              {(fetching || fetchErr) && (
                <div className="mt-1.5 text-[11px] text-[var(--text-muted)] sm:mt-2 sm:text-xs">
                  {fetching ? "Loading details…" : "Showing limited info"}
                </div>
              )}
            </div>
          </div>

          {/* Price / attributes */}
          <div className="space-y-0.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 text-[var(--text)] shadow-soft sm:space-y-1 sm:p-4">
            <p className="text-xl font-bold text-[var(--text)] sm:text-2xl">
              {fmtKES(display.price)}
            </p>
            {display.negotiable && (
              <p className="text-xs text-[var(--text-muted)] sm:text-sm">Negotiable</p>
            )}
            {display.brand && (
              <p className="text-xs text-[var(--text-muted)] sm:text-sm">Brand: {display.brand}</p>
            )}
            {display.condition && (
              <p className="text-xs text-[var(--text-muted)] sm:text-sm">
                Condition: {display.condition}
              </p>
            )}
            {display.location && (
              <p className="text-xs text-[var(--text-muted)] sm:text-sm">
                Location: {display.location}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 text-[var(--text)] shadow-soft sm:p-4">
            <h2 className="mb-1 text-sm font-semibold text-[var(--text)] sm:mb-2 sm:text-base">
              Description
            </h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--text)] sm:text-base">
              {display.description || "No description provided."}
            </p>
          </div>

          {/* Seller panel */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 text-[var(--text)] shadow-soft sm:p-4">
            <div className="text-xs font-semibold text-[var(--text)] sm:text-sm">Seller</div>

            <div className="mt-2 sm:mt-3">
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
                storeHref={storeHref}
                donateSellerId={sellerIdForDonate}
                // ✅ single source of truth for verification + tier
                verified={seller.verified}
                featuredTier={listingTier}
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
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 text-[var(--text)] shadow-soft sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-[var(--text)]">Reviews</h3>
              {reviewSummary && reviewSummary.count ? (
                <div className="text-xs text-[var(--text-muted)]">
                  <span className="font-medium text-[var(--text)]">
                    {(reviewSummary.average ?? 0).toFixed(1)} / 5
                  </span>{" "}
                  · {reviewSummary.count} {reviewSummary.count === 1 ? "review" : "reviews"}
                </div>
              ) : (
                <div className="text-xs text-[var(--text-muted)]">No reviews yet</div>
              )}
            </div>

            <div className="mt-2 space-y-2 sm:mt-3 sm:space-y-3">
              {reviewErr && <p className="text-xs text-destructive">{reviewErr}</p>}

              {reviewLoading && reviews.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">Loading reviews…</p>
              ) : null}

              <ReviewSummary
                average={hookAverage}
                count={hookCount}
                {...(hookSummary?.breakdown ? { breakdown: hookSummary.breakdown } : {})}
                size="md"
              />

              <ReviewList reviews={reviews} />

              {display?.id && (
                <AddReviewForm
                  listingId={display.id!}
                  listingType="product"
                  onSubmittedAction={onReviewCreated}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
