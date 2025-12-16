"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { useSession } from "next-auth/react";
import FavoriteButton from "@/app/components/favorites/FavoriteButton";
import DeleteListingButton from "@/app/components/DeleteListingButton";
import { buildServiceSeo } from "@/app/lib/seo";
import Gallery from "@/app/components/Gallery";
import ContactModalService from "@/app/components/ContactModalService";
import { useServices } from "@/app/lib/servicesStore";
import { extractGalleryUrls, stripPlaceholderIfOthers } from "@/app/lib/media";
import type { UrlObject as MediaUrlObject } from "@/app/lib/media";

import ReviewSummary from "@/app/components/ReviewSummary";
import { ReviewList } from "@/app/components/ReviewList";
import { AddReviewForm } from "@/app/components/AddReviewForm";
import { useListingReviews } from "@/app/hooks/useListingReviews";
import SellerInfo from "@/app/components/SellerInfo";

type FeaturedTier = "basic" | "gold" | "diamond";

export type ServiceWire = {
  id: string;
  name?: string | null;
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;

  price?: number | null;
  rateType?: "hour" | "day" | "fixed" | null;

  image?: string | null;
  gallery?: string[];
  images?: Array<string | MediaUrlObject>;
  photos?: Array<string | MediaUrlObject>;
  media?: Array<string | MediaUrlObject>;
  imageUrls?: string[];

  serviceArea?: string | null;
  availability?: string | null;
  location?: string | null;
  featured?: boolean;

  status?: "ACTIVE" | "SOLD" | "HIDDEN" | "DRAFT" | string | null;

  sellerId?: string | null;
  sellerName?: string | null;
  sellerPhone?: string | null;
  sellerLocation?: string | null;
  sellerMemberSince?: string | null;
  sellerRating?: number | null;
  sellerSales?: number | null;
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

  /** Optional store-location URL from API */
  sellerStoreLocationUrl?: string | null;

  /** Optional seller/account flags */
  sellerVerified?: boolean | null;
  sellerFeaturedTier?: FeaturedTier | null;
};

type StoreRow = ReturnType<typeof useServices> extends { services: infer U }
  ? U extends (infer V)[]
    ? V
    : never
  : never;

type Detail = Partial<StoreRow> & ServiceWire;

type ReviewSummaryPayload = {
  average: number | null;
  count: number;
  viewerRating?: number | null;
};

const PLACEHOLDER = "/placeholder/default.jpg";
const GALLERY_SIZES = "(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 800px";
const DETAIL_FETCH_TIMEOUT_MS = 10_000;

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || n <= 0) return "Contact for quote";
  try {
    return `KES ${new Intl.NumberFormat("en-KE").format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}
function rateSuffix(rt?: "hour" | "day" | "fixed" | null) {
  if (rt === "hour") return "/hr";
  if (rt === "day") return "/day";
  return "";
}
function normRateType(rt: unknown): "hour" | "day" | "fixed" {
  return rt === "hour" || rt === "day" || rt === "fixed" ? rt : "hour";
}
function isPlaceholder(u?: string | null) {
  if (!u) return false;
  const s = String(u).trim();
  return s === PLACEHOLDER || s.endsWith("/placeholder/default.jpg");
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
  verified: boolean;
  tier: FeaturedTier;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="seller-badges-row">
      {verified ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200">
          <span aria-hidden>✓</span>
          <span>Verified</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
          <span aria-hidden>!</span>
          <span>Unverified</span>
        </span>
      )}

      {tier === "gold" ? (
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
      )}
    </div>
  );
}

export default function ServicePageClient({
  id,
  initialData,
}: {
  id: string;
  initialData: ServiceWire | null;
}) {
  const { data: session } = useSession();
  const viewerId = (session?.user as any)?.id as string | undefined;

  const { services } = useServices();
  const listingType = "service" as const;

  const {
    reviews,
    summary,
    average: avgRating,
    count: reviewCount,
    loading: reviewsLoading,
    error: reviewsError,
    reload: reloadReviews,
    onReviewCreated,
    onReviewUpdated,
    onReviewDeleted,
  } = useListingReviews({
    listingId: id,
    listingType,
  });

  const [fetched, setFetched] = useState<Detail | null>((initialData as unknown as Detail) ?? null);
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [gone, setGone] = useState(false);

  const service = useMemo(() => {
    if (!id) return undefined;
    const s = services.find((x: any) => String(x.id) === String(id)) as StoreRow | undefined;
    return (s as Detail) || undefined;
  }, [services, id]);

  const hasRealGallery = useCallback((obj: unknown): boolean => {
    const urls = extractGalleryUrls((obj as any) || {}, PLACEHOLDER);
    return urls.some((u) => u && u !== PLACEHOLDER);
  }, []);

  const fetchAbortRef = useRef<AbortController | null>(null);

  // If we already have a strong cached row (e.g. after visiting once), avoid a redundant detail fetch.
  useEffect(() => {
    if (!id || gone || fetched) return;
    if (!service) return;

    const s: any = service;
    const descOk = typeof s?.description === "string" && s.description.trim().length > 0;
    const mediaOk = hasRealGallery(s);
    const notPartial = s?._partial !== true;

    if (descOk && mediaOk && notPartial) {
      setFetched(service as Detail);
    }
  }, [id, gone, fetched, service, hasRealGallery]);

  useEffect(() => {
    if (!id || gone || fetching || fetched) return;

    // If we have a store row but it still looks incomplete, fetch detail.
    // (We only skip if the prior effect already promoted it into `fetched`.)
    const ctrl = new AbortController();
    fetchAbortRef.current?.abort();
    fetchAbortRef.current = ctrl;

    const t = setTimeout(() => ctrl.abort(), DETAIL_FETCH_TIMEOUT_MS);

    (async () => {
      try {
        setFetching(true);
        setFetchErr(null);

        const r = await fetch(`/api/services/${encodeURIComponent(id)}`, {
          cache: "no-store",
          credentials: "include",
          headers: {
            Accept: "application/json",
            "cache-control": "no-store",
          },
          signal: ctrl.signal,
        });

        if (r.status === 404) {
          if (!ctrl.signal.aborted) setGone(true);
          return;
        }

        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || `Failed to load (${r.status})`);

        const maybe: Detail | null =
          (j && (("service" in j ? (j as any).service : j) as Detail)) || null;

        const status = (maybe as any)?.status;
        if (status && String(status).toUpperCase() !== "ACTIVE") {
          if (!ctrl.signal.aborted) setGone(true);
          return;
        }

        if (!ctrl.signal.aborted) setFetched(maybe);
      } catch (e: any) {
        if (!ctrl.signal.aborted) {
          setFetchErr(e?.message || "Failed to load service");
        }
      } finally {
        clearTimeout(t);
        if (!ctrl.signal.aborted) setFetching(false);
      }
    })();

    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [id, gone, fetching, fetched]);

  const didRefetchEmpty = useRef(false);
  const hasRealFromCurrent = useMemo(
    () => hasRealGallery(fetched ?? service ?? {}),
    [fetched, service, hasRealGallery],
  );

  useEffect(() => {
    if (!id || gone || fetching) return;
    if (!fetched) return;
    if (hasRealFromCurrent) return;
    if (didRefetchEmpty.current) return;

    didRefetchEmpty.current = true;

    const ctrl = new AbortController();
    fetchAbortRef.current?.abort();
    fetchAbortRef.current = ctrl;

    const t = setTimeout(() => ctrl.abort(), DETAIL_FETCH_TIMEOUT_MS);

    let backoffTimer: ReturnType<typeof setTimeout> | null = null;
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        backoffTimer = setTimeout(() => resolve(), ms);
      });

    (async () => {
      try {
        setFetching(true);
        setFetchErr(null);

        const request = () =>
          fetch(`/api/services/${encodeURIComponent(id)}`, {
            cache: "no-store",
            credentials: "include",
            headers: {
              Accept: "application/json",
              "cache-control": "no-store",
            },
            signal: ctrl.signal,
          });

        const r = await request();

        if (r.status === 404) {
          if (!ctrl.signal.aborted) setGone(true);
          return;
        }

        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || `Failed to load (${r.status})`);

        const maybe: Detail | null =
          (j && (("service" in j ? (j as any).service : j) as Detail)) || null;

        const status = (maybe as any)?.status;
        if (status && String(status).toUpperCase() !== "ACTIVE") {
          if (!ctrl.signal.aborted) setGone(true);
          return;
        }

        const timedFallback = r.headers.get("x-api-fallback") === "timed-out";
        const stillEmpty = !hasRealGallery(maybe || {});

        if (!ctrl.signal.aborted) setFetched(maybe);

        // ✅ one backoff retry only when fallback timed out OR payload still placeholder-only
        if ((timedFallback || stillEmpty) && !ctrl.signal.aborted) {
          await sleep(1200);
          if (ctrl.signal.aborted) return;

          const r2 = await request();

          if (r2.status === 404) {
            if (!ctrl.signal.aborted) setGone(true);
            return;
          }

          const j2 = await r2.json().catch(() => ({}));
          if (r2.ok) {
            const maybe2: Detail | null =
              (j2 && (("service" in j2 ? (j2 as any).service : j2) as Detail)) || null;

            const status2 = (maybe2 as any)?.status;
            if (status2 && String(status2).toUpperCase() !== "ACTIVE") {
              if (!ctrl.signal.aborted) setGone(true);
              return;
            }

            if (!ctrl.signal.aborted && hasRealGallery(maybe2 || {})) {
              setFetched(maybe2);
            }
          }
        }
      } catch (e: any) {
        if (!ctrl.signal.aborted) {
          setFetchErr(e?.message || "Failed to load service");
        }
      } finally {
        clearTimeout(t);
        if (backoffTimer) clearTimeout(backoffTimer);
        if (!ctrl.signal.aborted) setFetching(false);
      }
    })();

    return () => {
      clearTimeout(t);
      if (backoffTimer) clearTimeout(backoffTimer);
      ctrl.abort();
    };
  }, [id, gone, fetching, fetched, hasRealFromCurrent, hasRealGallery]);

  useEffect(() => {
    const status = (service as any)?.status;
    if (status && String(status).toUpperCase() !== "ACTIVE") {
      setGone(true);
    }
  }, [service]);

  if (gone) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 grid h-10 w-10 place-content-center rounded-lg bg-[#161748] text-white">
            404
          </div>
          <h1 className="text-lg font-semibold text-foreground">Service unavailable</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This service was removed or isn’t available anymore.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Link href="/" prefetch={false} className="btn-gradient-primary">
              Home
            </Link>
            <Link href="/search?type=service" prefetch={false} className="btn-gradient-primary">
              Browse services
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const displayMaybe = (fetched || service) as Detail | undefined;

  // ✅ Always resolve to a real boolean + tier (no “missing badges” on partial data)
  const resolvedVerified =
    pickFirstBool(
      (displayMaybe as any)?.sellerVerified,
      (displayMaybe as any)?.verified,
      (displayMaybe as any)?.seller?.verified,
      (displayMaybe as any)?.seller?.isVerified,
    ) ?? false;

  const resolvedTier: FeaturedTier =
    coerceFeaturedTier((displayMaybe as any)?.sellerFeaturedTier) ??
    coerceFeaturedTier((displayMaybe as any)?.seller_featured_tier) ??
    coerceFeaturedTier((displayMaybe as any)?.featuredTier) ??
    coerceFeaturedTier((displayMaybe as any)?.featured_tier) ??
    coerceFeaturedTier((displayMaybe as any)?.seller?.featuredTier) ??
    coerceFeaturedTier((displayMaybe as any)?.seller?.featured_tier) ??
    coerceFeaturedTier((displayMaybe as any)?.seller?.tier) ??
    "basic";

  const display: Detail = {
    id: displayMaybe?.id ?? id ?? "unknown",
    name: displayMaybe?.name ?? "Service",
    description: displayMaybe?.description ?? null,
    category: displayMaybe?.category ?? "General",
    subcategory: displayMaybe?.subcategory ?? null,
    price: typeof displayMaybe?.price === "number" ? displayMaybe.price : null,
    ...(displayMaybe?.rateType ? { rateType: normRateType(displayMaybe.rateType) } : {}),
    image: displayMaybe?.image ?? null,
    gallery: Array.isArray(displayMaybe?.gallery) ? (displayMaybe.gallery as string[]) : [],
    serviceArea: displayMaybe?.serviceArea ?? null,
    availability: displayMaybe?.availability ?? null,
    location: displayMaybe?.location ?? null,
    featured: Boolean(displayMaybe?.featured),
    sellerId: displayMaybe?.sellerId ?? null,
    sellerName: displayMaybe?.sellerName ?? null,
    sellerPhone: displayMaybe?.sellerPhone ?? null,
    sellerLocation: displayMaybe?.sellerLocation ?? null,
    sellerMemberSince: displayMaybe?.sellerMemberSince ?? null,
    sellerRating: typeof displayMaybe?.sellerRating === "number" ? displayMaybe.sellerRating : null,
    sellerSales: typeof displayMaybe?.sellerSales === "number" ? displayMaybe.sellerSales : null,
    seller: displayMaybe?.seller ?? null,
    ...(displayMaybe && "status" in displayMaybe && displayMaybe.status != null
      ? { status: displayMaybe.status as any }
      : {}),
    sellerStoreLocationUrl:
      displayMaybe?.sellerStoreLocationUrl ?? (displayMaybe as any)?.storeLocationUrl ?? null,

    // ✅ stable flags
    sellerVerified: resolvedVerified,
    sellerFeaturedTier: resolvedTier,
  };

  const galleryToRender = useMemo(() => {
    const urls = extractGalleryUrls(displayMaybe || {}, PLACEHOLDER);
    const pruned = stripPlaceholderIfOthers(urls, PLACEHOLDER);

    if (!pruned || pruned.length === 0) {
      if (displayMaybe?.image && !isPlaceholder(displayMaybe.image)) {
        return [displayMaybe.image];
      }
      return [PLACEHOLDER];
    }
    return pruned;
  }, [displayMaybe]);

  const enableLightbox = useMemo(
    () => galleryToRender.some((u) => u && u !== PLACEHOLDER),
    [galleryToRender],
  );

  const seller = useMemo(() => {
    const nested: any = (display as any)?.seller || {};
    const username = (nested?.username || "").trim() || null;

    const storeLocationUrl =
      typeof nested?.storeLocationUrl === "string"
        ? nested.storeLocationUrl
        : typeof (display as any)?.sellerStoreLocationUrl === "string"
          ? (display as any).sellerStoreLocationUrl
          : typeof (display as any)?.storeLocationUrl === "string"
            ? (display as any).storeLocationUrl
            : null;

    // ✅ force boolean + tier for consistent visible badges
    const verified =
      pickFirstBool(nested?.verified, nested?.isVerified, (display as any)?.sellerVerified) ?? false;

    const featuredTier: FeaturedTier =
      coerceFeaturedTier(nested?.featuredTier) ??
      coerceFeaturedTier(nested?.featured_tier) ??
      coerceFeaturedTier(nested?.tier) ??
      coerceFeaturedTier((display as any)?.sellerFeaturedTier) ??
      "basic";

    return {
      id: nested?.id ?? display?.sellerId ?? null,
      username,
      name: nested?.name ?? display?.sellerName ?? "Service Provider",
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

  const isOwner = Boolean(viewerId && sellerUserIdForStore && viewerId === sellerUserIdForStore);

  // ✅ FIX: prefer a VALID username handle; otherwise fall back to u-<real user id>.
  // Never allow store-code-ish tokens like Sto-83535 to become the store slug.
  const displaySellerUsername = (display as any)?.sellerUsername as unknown;
  const displayUsername = (display as any)?.username as unknown;

  const storeSlug = useMemo(() => {
    const uname =
      coerceValidStoreUsername(seller.username) ??
      coerceValidStoreUsername(displaySellerUsername) ??
      coerceValidStoreUsername(displayUsername);

    if (uname) return uname;

    const uid = sellerUserIdForStore;
    return uid ? `u-${uid}` : null;
  }, [seller.username, displaySellerUsername, displayUsername, sellerUserIdForStore]);

  const storeHref = useMemo(() => {
    if (!storeSlug) return null;
    return `/store/${encodeURIComponent(storeSlug)}`;
  }, [storeSlug]);

  const sellerIdForDonate: string | null = sellerUserIdForStore;

  const seo = useMemo(() => {
    const nonPlaceholder = galleryToRender.filter((u) => u && u !== PLACEHOLDER);
    return buildServiceSeo({
      id: display.id!,
      name: display.name!,
      ...(display.description != null ? { description: display.description } : {}),
      ...(typeof display.price === "number" ? { price: display.price } : {}),
      ...(nonPlaceholder.length ? { image: nonPlaceholder } : {}),
      ...(display.category ? { category: display.category } : {}),
      ...(display.subcategory ? { subcategory: display.subcategory } : {}),
      ...(display.rateType ? { rateType: display.rateType } : {}),
      ...(display.location ? { location: display.location } : {}),
      ...(display.serviceArea ? { serviceArea: display.serviceArea } : {}),
      ...(display.sellerName ? { sellerName: display.sellerName } : {}),
      urlPath: `/service/${display.id}`,
      status: "ACTIVE",
    });
  }, [display, galleryToRender]);

  const copyLink = useCallback(async () => {
    if (!display?.id) return;
    try {
      const shareUrl =
        typeof window !== "undefined" && window.location
          ? `${window.location.origin}/service/${display.id}`
          : `/service/${display.id}`;
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  }, [display?.id]);

  /* ------------------------------ Reviews ------------------------------- */

  const listingId = display.id!;

  const viewerReview = useMemo(
    () =>
      (reviews as any[]).find(
        (r: any) =>
          (viewerId && r.userId && String(r.userId) === String(viewerId)) ||
          (viewerId && r.user?.id && String(r.user.id) === String(viewerId)),
      ) || null,
    [reviews, viewerId],
  );

  const reviewSummary: ReviewSummaryPayload | null = useMemo(
    () =>
      summary
        ? {
            average: typeof summary.average === "number" ? summary.average : avgRating ?? null,
            count:
              typeof summary.count === "number"
                ? summary.count
                : reviewCount ?? (reviews as any[]).length,
            viewerRating:
              viewerReview && typeof (viewerReview as any).rating === "number"
                ? (viewerReview as any).rating
                : null,
          }
        : (reviews as any[]).length
          ? {
              average:
                typeof avgRating === "number"
                  ? avgRating
                  : (reviews as any[]).reduce((acc, r: any) => acc + (r.rating || 0), 0) /
                    (reviews as any[]).length,
              count: (reviews as any[]).length,
              viewerRating:
                viewerReview && typeof (viewerReview as any).rating === "number"
                  ? (viewerReview as any).rating
                  : null,
            }
          : null,
    [summary, avgRating, reviewCount, reviews, viewerReview],
  );

  /* -------------------------------- UI --------------------------------- */

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
            <div className="relative" style={{ aspectRatio: "16 / 10" }}>
              {display.featured && (
                <span className="absolute left-3 top-3 z-20 rounded-md bg-[#161748] px-2 py-1 text-xs text-white shadow">
                  Featured
                </span>
              )}

              <Gallery images={galleryToRender} sizes={GALLERY_SIZES} lightbox={enableLightbox} />

              <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-black/5 dark:ring-white/10" />
            </div>

            {/* Overlay controls */}
            <div className="absolute right-3 top-3 z-[80] flex gap-2">
              <button
                type="button"
                onClick={copyLink}
                className="btn-gradient-primary inline-flex items-center gap-1 px-2 py-1 text-xs"
                title="Copy link"
                aria-label="Copy link"
              >
                Copy
              </button>

              <FavoriteButton serviceId={display.id!} />

              {isOwner && (
                <>
                  <Link
                    href={`/service/${display.id}/edit`}
                    prefetch={false}
                    className="btn-gradient-primary inline-flex items-center gap-1 px-2 py-1 text-xs"
                    title="Edit service"
                    aria-label="Edit service"
                  >
                    Edit
                  </Link>

                  <DeleteListingButton
                    serviceId={display.id!}
                    label="Delete"
                    buttonSize="sm"
                    buttonVariant="solid"
                    buttonTone="danger"
                    redirectHref="/dashboard?deleted=1"
                  />
                </>
              )}
            </div>

            {(fetching || fetchErr) && (
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[75] bg-background/80 p-2 text-center text-xs text-foreground">
                {fetching ? "Loading…" : fetchErr || "Showing limited info"}
              </div>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="space-y-4 lg:col-span-2">
          {/* Header / title */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brandBlue/80 dark:text-brandBlue">
                Service
              </p>
              <h1 className="mt-1 text-2xl font-bold text-foreground">{display.name || "Service"}</h1>
              {/* Hidden ID for tests */}
              <span className="sr-only" data-testid="service-id">
                {display.id}
              </span>
            </div>
          </div>

          {/* Rate / meta */}
          <div className="space-y-1 rounded-xl border border-border bg-card p-4">
            <p className="text-2xl font-bold text-[#161748] dark:text-brandBlue">
              {fmtKES(display.price)} {rateSuffix(display.rateType ?? null)}
            </p>
            {display.serviceArea && (
              <p className="text-sm text-muted-foreground">Service Area: {display.serviceArea}</p>
            )}
            {display.location && (
              <p className="text-sm text-muted-foreground">Base Location: {display.location}</p>
            )}
          </div>

          {/* Description */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-2 font-semibold text-foreground">Description</h2>
            <p className="whitespace-pre-line text-foreground">
              {display.description || "No description provided."}
            </p>
          </div>

          {/* ✅ Explicit visible badges (no more missing Verified/Unverified text) */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-sm font-semibold text-foreground">Provider badges</div>
            <SellerBadgesRow verified={seller.verified} tier={seller.featuredTier} />
          </div>

          {/* Provider / Contact / Store / Donate */}
          <SellerInfo
            label="Provider"
            sellerId={sellerUserIdForStore}
            username={seller.username ?? null}
            name={seller.name ?? null}
            avatarUrl={seller.image ?? null}
            locationLabel={seller.location ?? display.sellerLocation ?? display.location ?? null}
            storeLocationUrl={seller.storeLocationUrl ?? display.sellerStoreLocationUrl ?? null}
            memberSince={seller.memberSince ?? null}
            rating={typeof seller.rating === "number" ? seller.rating : null}
            salesCount={typeof seller.sales === "number" ? seller.sales : null}
            verified={seller.verified}
            featuredTier={seller.featuredTier}
            storeHref={storeHref}
            donateSellerId={sellerIdForDonate}
            contactSlot={
              <ContactModalService
                className="btn-gradient-primary"
                serviceId={display.id!}
                serviceName={display.name ?? "Service"}
                fallbackName={display.sellerName ?? (display.seller as any)?.name ?? null}
                fallbackLocation={display.sellerLocation ?? (display.seller as any)?.location ?? null}
                buttonLabel="Message provider"
              />
            }
          />

          {/* Reviews */}
          <div
            className="rounded-xl border border-border bg-card p-4"
            data-section="reviews"
            {...(reviewSummary
              ? { "data-review-avg": reviewSummary.average ?? undefined, "data-review-count": reviewSummary.count }
              : {})}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-foreground">Reviews</h3>
              <ReviewSummary
                reviews={reviews as any[]}
                average={reviewSummary?.average ?? null}
                count={reviewSummary?.count ?? (reviews as any[]).length}
                loading={reviewsLoading}
              />
            </div>

            {reviewsError && <p className="mt-2 text-xs text-destructive">{reviewsError}</p>}

            <div className="mt-3 space-y-4">
              <AddReviewForm
                listingId={listingId}
                listingType={listingType}
                existingReview={viewerReview ?? undefined}
                onSubmittedAction={async (...args) => {
                  await onReviewCreated(...args);
                  await reloadReviews();
                }}
              />

              <ReviewList
                reviews={reviews as any[]}
                onReviewEditAction={onReviewUpdated}
                onReviewDeleteAction={onReviewDeleted}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
