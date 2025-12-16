"use client";

// src/app/components/productcard.tsx

import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SmartImage from "@/app/components/SmartImage";
import { shimmer as shimmerMaybe } from "@/app/lib/blur";
import DeleteListingButton from "@/app/components/DeleteListingButton";
import ReviewStars from "@/app/components/ReviewStars";
import VerifiedBadge from "@/app/components/VerifiedBadge";

type Props = {
  id: string;
  name?: string | null;
  image?: string | null;
  price?: number | null;

  /** Listing highlight */
  featured?: boolean | null;

  /** Seller/account flags for public UI (preferred names) */
  verified?: boolean | null;
  featuredTier?: "basic" | "gold" | "diamond" | string | null;

  /** Seller/account flags for public UI (alias names from some APIs/callers) */
  sellerVerified?: boolean | null;
  sellerFeaturedTier?: "basic" | "gold" | "diamond" | string | null;

  position?: number;
  prefetch?: boolean;
  className?: string;

  /** Optional rating summary (for grids / feeds). */
  ratingAverage?: number | null;
  ratingCount?: number | null;

  /** Dashboard mode: show Edit/Delete controls */
  ownerControls?: boolean;
  /** Optional custom edit href (defaults to /product/:id/edit) */
  editHref?: string;
  /** Called after a successful delete */
  onDeletedAction?: () => void;
};

const PLACEHOLDER = "/placeholder/default.jpg";
const FALLBACK_BLUR =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAuMB9l9b3a8AAAAASUVORK5CYII=";

function getBlurDataURL(width = 640, height = 640): string {
  try {
    const fn: unknown = shimmerMaybe;
    if (typeof fn === "function") {
      // Support both shimmer(w,h) and shimmer({width,height})
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyFn = fn as any;
      return anyFn.length >= 2 ? anyFn(width, height) : anyFn({ width, height });
    }
  } catch {
    // ignore
  }
  return FALLBACK_BLUR;
}

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
    return "Contact for price";
  }
  try {
    return `KES ${new Intl.NumberFormat("en-KE", {
      maximumFractionDigits: 0,
    }).format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

function track(event: string, payload?: Record<string, unknown>) {
  if (typeof window !== "undefined" && "CustomEvent" in window) {
    window.dispatchEvent(
      new CustomEvent("qs:track", { detail: { event, payload } }),
    );
  }
}

function SellerTextBadges({
  verified,
  tier,
}: {
  verified?: boolean | null;
  tier?: "basic" | "gold" | "diamond" | null;
}) {
  const showVerified = typeof verified === "boolean";
  const showTier = tier === "basic" || tier === "gold" || tier === "diamond";
  if (!showVerified && !showTier) return null;

  const pillBase =
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {showVerified ? (
        verified ? (
          <span
            className={`${pillBase} border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200`}
          >
            <span aria-hidden>✓</span>
            {" "}
            <span>Verified</span>
          </span>
        ) : (
          <span
            className={`${pillBase} border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200`}
          >
            <span aria-hidden>!</span>
            {" "}
            <span>Unverified</span>
          </span>
        )
      ) : null}

      {showTier ? (
        tier === "gold" ? (
          <span
            className={`${pillBase} border-yellow-300 bg-gradient-to-r from-yellow-200 via-yellow-100 to-yellow-300 text-yellow-950 dark:border-yellow-900/40 dark:from-yellow-900/30 dark:via-yellow-900/10 dark:to-yellow-900/30 dark:text-yellow-100`}
          >
            <span aria-hidden>★</span>
            {" "}
            <span>Featured Gold</span>
          </span>
        ) : tier === "diamond" ? (
          <span
            className={`${pillBase} border-indigo-300 bg-gradient-to-r from-sky-200 via-indigo-100 to-violet-200 text-slate-950 dark:border-indigo-900/40 dark:from-indigo-900/30 dark:via-indigo-900/10 dark:to-indigo-900/30 dark:text-slate-100`}
          >
            <span aria-hidden>💎</span>
            {" "}
            <span>Featured Diamond</span>
          </span>
        ) : (
          <span className={`${pillBase} border-border bg-muted text-foreground`}>
            <span aria-hidden>★</span>
            {" "}
            <span>Featured Basic</span>
          </span>
        )
      ) : null}
    </div>
  );
}

function ProductCardImpl({
  id,
  name,
  image,
  price,
  featured = false,

  verified,
  featuredTier,
  sellerVerified,
  sellerFeaturedTier,

  position,
  prefetch = true,
  className = "",
  ratingAverage,
  ratingCount,
  ownerControls = false,
  editHref,
  onDeletedAction,
}: Props) {
  const router = useRouter();

  // Canonical product detail URL
  const href = useMemo(() => `/product/${encodeURIComponent(id)}`, [id]);
  const hrefEdit = editHref ?? `/product/${encodeURIComponent(id)}/edit`;

  const anchorRef = useRef<HTMLAnchorElement | null>(null);
  const seenRef = useRef(false);

  const priority = typeof position === "number" ? position < 8 : false;
  const src = image || PLACEHOLDER;

  const blurProps = priority
    ? ({
        placeholder: "blur" as const,
        blurDataURL: getBlurDataURL(640, 640),
      } as const)
    : ({ placeholder: "empty" as const } as const);

  const priceText = fmtKES(price);

  const hasRating =
    typeof ratingAverage === "number" &&
    ratingAverage > 0 &&
    typeof ratingCount === "number" &&
    ratingCount > 0;

  const effectiveVerified: boolean | null =
    typeof verified === "boolean"
      ? verified
      : typeof sellerVerified === "boolean"
        ? sellerVerified
        : null;

  const featuredTierRaw = (featuredTier ?? sellerFeaturedTier ?? null) as
    | string
    | null;

  const tier = useMemo(() => {
    if (typeof featuredTierRaw === "string") {
      const t = featuredTierRaw.trim().toLowerCase();
      if (t === "basic" || t === "gold" || t === "diamond") return t;
    }
    return featured ? "basic" : null;
  }, [featuredTierRaw, featured]);

  // Impression tracking
  useEffect(() => {
    if (!anchorRef.current || seenRef.current || typeof window === "undefined")
      return;
    const el = anchorRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !seenRef.current) {
            seenRef.current = true;
            track("product_view", { id, name, price, position, href });
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "0px 0px -20% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [id, name, price, position, href]);

  // Prefetch when near viewport
  useEffect(() => {
    if (!prefetch || !anchorRef.current) return;
    let done = false;
    const el = anchorRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !done) {
            done = true;
            try {
              (router as unknown as { prefetch?: (u: string) => void })?.prefetch?.(
                href,
              );
            } catch {
              // ignore
            }
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [href, prefetch, router]);

  const hoverPrefetch = useCallback(() => {
    if (!prefetch) return;
    try {
      (router as unknown as { prefetch?: (u: string) => void })?.prefetch?.(href);
    } catch {
      // ignore
    }
  }, [href, prefetch, router]);

  const onClick = useCallback(() => {
    track("product_click", { id, name, price, position, href });
  }, [id, name, price, position, href]);

  return (
    <div
      className={[
        "group relative overflow-hidden rounded-xl border bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm transition will-change-transform",
        "hover:-translate-y-0.5 hover:shadow-md",
        "border-[var(--border-subtle)]",
        className,
      ].join(" ")}
      role="article"
      aria-label={name ?? "Product"}
      data-product-id={id}
      data-card="product"
      data-listing-id={id}
      data-listing-kind="product"
      {...(hasRating
        ? { "data-rating-avg": ratingAverage, "data-rating-count": ratingCount }
        : {})}
    >
      {/* Owner controls: separate from main link */}
      {ownerControls && (
        <div className="absolute right-2 top-2 z-20 flex items-center gap-2">
          <Link
            href={hrefEdit}
            className="rounded border bg-subtle px-2 py-1 text-xs text-[var(--text)] hover:bg-[var(--bg-elevated)] border-[var(--border-subtle)]"
            title="Edit product"
            aria-label="Edit product"
            prefetch={false}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            Edit
          </Link>

          <div
            className="contents"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <DeleteListingButton
              productId={id}
              label=""
              className="px-2 py-1"
              {...(onDeletedAction ? { onDeletedAction } : {})}
            />
          </div>
        </div>
      )}

      {/* Single canonical Link → /product/[id] */}
      <Link
        href={href}
        prefetch={prefetch}
        onMouseEnter={hoverPrefetch}
        onFocus={hoverPrefetch}
        onClick={onClick}
        ref={anchorRef}
        title={name ?? "Product"}
        aria-label={name ? `View product: ${name}` : "View product"}
        className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161748]/50"
      >
        <div className="relative aspect-square w-full overflow-hidden bg-muted">
          <SmartImage
            src={src}
            alt={name || "Product image"}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            priority={priority}
            {...blurProps}
          />
          {featured && (
            <span className="absolute left-2 top-2 rounded-md bg-[#161748] px-2 py-1 text-xs font-semibold text-white shadow">
              Featured
            </span>
          )}
        </div>

        <div className="p-3">
          <div className="line-clamp-1 font-semibold text-[var(--text)]">
            {name ?? "Product"}
          </div>

          <div className="mt-1 text-[15px] font-bold text-brandBlue">{priceText}</div>

          {/* ✅ Ensure *visible* “Verified/Unverified” + tier text exists for tests */}
          <SellerTextBadges
            verified={effectiveVerified}
            tier={tier as "basic" | "gold" | "diamond" | null}
          />

          {/* Keep your existing component */}
          {(typeof effectiveVerified === "boolean" || tier) && (
            <div className="mt-2">
              <VerifiedBadge
                verified={effectiveVerified}
                featured={Boolean(featured)}
                featuredTier={tier}
              />
            </div>
          )}

          {hasRating && (
            <div
              className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-muted)]"
              aria-label={`${ratingAverage?.toFixed(1)} out of 5 stars from ${ratingCount} reviews`}
            >
              <ReviewStars rating={ratingAverage || 0} />
              <span className="font-medium">{ratingAverage?.toFixed(1)}</span>
              <span className="text-[0.7rem] text-muted-foreground">
                ({ratingCount})
              </span>
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}

(ProductCardImpl as unknown as { displayName?: string }).displayName = "ProductCard";

export default memo(ProductCardImpl);
