"use client";

// src/app/components/productcard.tsx

import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SmartImage from "@/app/components/SmartImage";
import { shimmer as shimmerMaybe } from "@/app/lib/blur";
import DeleteListingButton from "@/app/components/DeleteListingButton";
import ReviewStars from "@/app/components/ReviewStars";

type FeaturedTier = "basic" | "gold" | "diamond";

type SellerBadgesWire =
  | {
      verified?: boolean | null;
      tier?: FeaturedTier | string | null;
    }
  | null;

type SellerBadges = { verified: boolean | null; tier: FeaturedTier | null };

type Props = {
  id: string;
  name?: string | null;
  image?: string | null;
  price?: number | null;

  /** Listing highlight */
  featured?: boolean | null;

  /** Canonical resolved inputs (preferred): */
  verified?: boolean | null;
  featuredTier?: FeaturedTier | string | null;

  /** Legacy/alias inputs (fallback only if canonical not provided): */
  sellerVerified?: boolean | null;
  sellerFeaturedTier?: FeaturedTier | string | null;

  /** Preferred consolidated badges from API (authoritative if the key exists). */
  sellerBadges?: SellerBadgesWire;

  /** Optional emailVerified-like value if passed by a caller (fallback only). */
  emailVerified?: boolean | null | string | Date;

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

function normalizeTier(v: unknown): FeaturedTier | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  return t === "basic" || t === "gold" || t === "diamond"
    ? (t as FeaturedTier)
    : null;
}

/**
 * Conservative resolver for emailVerified-like values:
 * - undefined => unknown (null)
 * - null => explicitly unverified (false)
 * - Date / ISO string => verified (true) when parseable
 * - boolean => as-is
 */
function resolveEmailVerifiedValue(v: unknown): boolean | null {
  if (v === undefined) return null;
  if (v === null) return false;

  if (typeof v === "boolean") return v;

  if (typeof v === "number") {
    if (v === 1) return true;
    if (v === 0) return false;
    return null;
  }

  if (v instanceof Date) {
    return Number.isFinite(v.getTime()) ? true : null;
  }

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const lower = s.toLowerCase();
    if (lower === "null" || lower === "undefined" || lower === "nan") return null;
    if (lower === "true" || lower === "1" || lower === "yes") return true;
    if (lower === "false" || lower === "0" || lower === "no") return false;

    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? true : null;
  }

  return null;
}

/**
 * Canonical badge renderer:
 * - Tier is icon-only (no visible tier words) with stable testids + accessibility.
 * - Verification uses stable testids (icon-only; screen reader text only).
 * - If both are unknown/null, renders nothing.
 */
function VerifiedBadge({
  sellerBadges,
  className = "",
}: {
  sellerBadges?: SellerBadges | null;
  className?: string;
}) {
  const verified = sellerBadges?.verified ?? null;
  const tier = sellerBadges?.tier ?? null;

  const showVerified = typeof verified === "boolean";
  const showTier = tier === "basic" || tier === "gold" || tier === "diamond";

  if (!showVerified && !showTier) return null;

  const pillBase =
    "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] sm:text-xs sm:px-2.5 sm:py-1.5 font-semibold leading-none shadow-sm";

  const pillStrong =
    "bg-[var(--bg-subtle)] text-[var(--text)] border-[var(--border)]";
  const pillSoft =
    "bg-[var(--bg-elevated)] text-[var(--text)] border-[var(--border-subtle)]";
  const pillMuted =
    "bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-subtle)]";

  return (
    <div
      className={["flex flex-wrap items-center gap-1", className]
        .filter(Boolean)
        .join(" ")}
    >
      {showVerified ? (
        verified ? (
          <span
            data-testid="verified-badge"
            aria-label="Verified"
            title="Verified"
            className={[pillBase, pillStrong].join(" ")}
          >
            <span aria-hidden>✓</span>
            <span className="sr-only">Verified</span>
          </span>
        ) : (
          <span
            data-testid="unverified-badge"
            aria-label="Unverified"
            title="Unverified"
            className={[pillBase, pillMuted].join(" ")}
          >
            <span aria-hidden>!</span>
            <span className="sr-only">Unverified</span>
          </span>
        )
      ) : null}

      {showTier ? (
        tier === "gold" ? (
          <span
            data-testid="featured-tier-gold"
            aria-label="Featured tier gold"
            title="Featured gold"
            className={[pillBase, pillStrong].join(" ")}
          >
            <span aria-hidden>★</span>
            <span className="sr-only">Featured gold</span>
          </span>
        ) : tier === "diamond" ? (
          <span
            data-testid="featured-tier-diamond"
            aria-label="Featured tier diamond"
            title="Featured diamond"
            className={[pillBase, pillStrong].join(" ")}
          >
            <span aria-hidden>💎</span>
            <span className="sr-only">Featured diamond</span>
          </span>
        ) : (
          <span
            data-testid="featured-tier-basic"
            aria-label="Featured tier basic"
            title="Featured basic"
            className={[pillBase, pillSoft].join(" ")}
          >
            <span aria-hidden>★</span>
            <span className="sr-only">Featured basic</span>
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
  sellerBadges,
  emailVerified,

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

  const badgesObj =
    sellerBadges && typeof sellerBadges === "object" && !Array.isArray(sellerBadges)
      ? sellerBadges
      : null;

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

  /**
   * Resolver: pick the first VALID value across sources (so null/undefined in sellerBadges
   * won't suppress a valid legacy/canonical value).
   */
  const tier = useMemo<FeaturedTier | null>(() => {
    const fromBadges = normalizeTier((badgesObj as any)?.tier);
    if (fromBadges) return fromBadges;

    const fromCanonical =
      featuredTier !== undefined ? normalizeTier(featuredTier) : null;
    if (fromCanonical) return fromCanonical;

    const fromLegacy =
      sellerFeaturedTier !== undefined ? normalizeTier(sellerFeaturedTier) : null;
    return fromLegacy;
  }, [badgesObj, featuredTier, sellerFeaturedTier]);

  const effectiveVerified = useMemo<boolean | null>(() => {
    const vb = (badgesObj as any)?.verified;
    if (typeof vb === "boolean") return vb;

    if (typeof verified === "boolean") return verified;
    if (typeof sellerVerified === "boolean") return sellerVerified;

    if (emailVerified !== undefined) return resolveEmailVerifiedValue(emailVerified);

    return null; // unknown => render nothing
  }, [badgesObj, verified, sellerVerified, emailVerified]);

  const sellerBadgesResolved = useMemo<SellerBadges>(
    () => ({ verified: effectiveVerified, tier }),
    [effectiveVerified, tier],
  );

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
        "group relative overflow-hidden rounded-2xl border bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm transition will-change-transform",
        "border-[var(--border-subtle)]",
        "hover:-translate-y-0.5 hover:border-[var(--border)] hover:shadow-soft",
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
      {/* Single canonical Link → /product/[id] (rendered before ownerControls so it is the first /product/* anchor) */}
      <Link
        href={href}
        prefetch={prefetch}
        onMouseEnter={hoverPrefetch}
        onFocus={hoverPrefetch}
        onClick={onClick}
        ref={anchorRef}
        title={name ?? "Product"}
        aria-label={name ? `View product: ${name}` : "View product"}
        className="relative block rounded-2xl focus-visible:outline-none focus-visible:ring-2 ring-focus"
      >
        <div
          className={[
            "relative w-full overflow-hidden bg-[var(--bg-subtle)]",
            "h-36 min-[420px]:h-40 sm:h-44",
          ].join(" ")}
        >
          {/* Badge overlays must be inside the <a> for Playwright locators */}
          <VerifiedBadge
            sellerBadges={sellerBadgesResolved}
            className="pointer-events-none absolute left-2 top-2 z-20"
          />

          <SmartImage
            src={src}
            alt={name || "Product image"}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            priority={priority}
            {...blurProps}
          />
        </div>

        <div className="p-2.5 sm:p-3">
          <div className="line-clamp-1 text-sm sm:text-base font-semibold text-[var(--text)]">
            {name ?? "Product"}
          </div>

          <div className="mt-1 text-sm sm:text-base font-extrabold tracking-tight text-[var(--text)]">
            {priceText}
          </div>

          {hasRating && (
            <div
              className="mt-1 flex items-center gap-1.5 text-[11px] sm:text-xs text-[var(--text-muted)]"
              aria-label={`${ratingAverage?.toFixed(1)} out of 5 stars from ${ratingCount} reviews`}
            >
              <ReviewStars rating={ratingAverage || 0} />
              <span className="font-medium text-[var(--text)]">
                {ratingAverage?.toFixed(1)}
              </span>
              <span className="text-[0.7rem] text-[var(--text-muted)]">
                ({ratingCount})
              </span>
            </div>
          )}
        </div>
      </Link>

      {/* Owner controls: separate from main link (kept AFTER main Link to avoid being the "first" /product/* anchor) */}
      {ownerControls && (
        <div className="absolute right-2 top-2 z-30 flex items-center gap-2">
          <Link
            href={hrefEdit}
            className={[
              "h-9 rounded-xl border px-2 text-[11px] sm:text-xs font-semibold shadow-sm transition",
              "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)]",
              "hover:bg-[var(--bg-subtle)] hover:border-[var(--border)]",
              "active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus",
              "inline-flex items-center",
            ].join(" ")}
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
              className="h-9 px-2 py-1"
              {...(onDeletedAction ? { onDeletedAction } : {})}
            />
          </div>
        </div>
      )}
    </div>
  );
}

(ProductCardImpl as unknown as { displayName?: string }).displayName = "ProductCard";

export default memo(ProductCardImpl);
