"use client";

// src/app/components/ListingCard.tsx

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/components/Icon";
import { Badge } from "@/app/components/Badge";
import { Button } from "@/app/components/Button";
import ReviewStars from "@/app/components/ReviewStars";

type Kind = "product" | "service";
type FeaturedTier = "basic" | "gold" | "diamond";
type SellerBadges = { verified: boolean | null; tier: FeaturedTier | null };

export type ListingCardProps = {
  id: string;
  href: string;
  title: string;
  price: number | string;
  currency?: "KES" | string;
  imageUrl?: string | null;
  location?: string;

  /** Canonical resolved inputs (preferred): */
  verified?: boolean | null;
  featuredTier?: FeaturedTier | string | null;

  /** Legacy/alias inputs (fallback only if canonical not provided): */
  sellerVerified?: boolean | null;
  sellerFeaturedTier?: FeaturedTier | string | null;

  /** Preferred consolidated badges from API. */
  sellerBadges?: {
    verified?: boolean | null;
    tier?: FeaturedTier | string | null;
  } | null;

  saved?: boolean;
  kind?: Kind;
  conditionLabel?: string;

  /** Back-compat highlight flag (also used for ring). */
  featured?: boolean;

  className?: string;

  /** Optional rating summary for this listing. */
  ratingAverage?: number | null;
  ratingCount?: number | null;

  /** Optional edit destination (enables Edit button in footer when present). */
  editHref?: string;
  /** Optional custom label for Edit button (defaults to "Edit"). */
  editLabel?: string;

  /** App Router-safe callbacks for analytics / side-effects. */
  onToggleSaveAction?: (next: boolean) => void | Promise<void>;
  onViewAction?: () => void | Promise<void>;
  onEditAction?: () => void | Promise<void>;

  /**
   * Optional donate / tip CTA hook.
   * If provided, a "Support" button will appear in the footer and call this
   * without navigating away from the card.
   */
  onDonateAction?: () => void | Promise<void>;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

/**
 * Unified price formatter for listings.
 * - Products: "Contact for price" for non-positive/invalid numbers.
 * - Services: "Contact for quote" for non-positive/invalid numbers.
 * - If a string is passed, it is returned as-is (caller override).
 */
function formatPrice(
  value: number | string,
  currency: string = "KES",
  kind: Kind = "product",
) {
  if (typeof value === "string") return value;

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return kind === "service" ? "Contact for quote" : "Contact for price";
  }

  try {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString("en-KE")}`;
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
 * Canonical badge renderer:
 * - Tier is icon-only (no visible tier words) with stable testids + accessibility.
 * - Verification uses stable testids (icon-only; screen reader text only).
 * - If both are unknown/null, renders nothing.
 */
function VerifiedBadge({ sellerBadges }: { sellerBadges?: SellerBadges | null }) {
  const verified = sellerBadges?.verified ?? null;
  const tier = sellerBadges?.tier ?? null;

  const showVerified = typeof verified === "boolean";
  const showTier = tier === "basic" || tier === "gold" || tier === "diamond";
  if (!showVerified && !showTier) return null;

  const pillBase = cn(
    "inline-flex items-center gap-1 rounded-xl border",
    "px-2 py-1 text-[11px] sm:px-2.5 sm:py-1.5 sm:text-xs font-semibold",
    "bg-[var(--bg-elevated)] text-[var(--text)]",
    "border-[var(--border-subtle)] shadow-sm",
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {showVerified ? (
        verified ? (
          <span
            data-testid="verified-badge"
            aria-label="Verified"
            title="Verified"
            className={cn(pillBase, "border-[var(--border)]")}
          >
            <span aria-hidden>✓</span>
            <span className="sr-only">Verified</span>
          </span>
        ) : (
          <span
            data-testid="unverified-badge"
            aria-label="Unverified"
            title="Unverified"
            className={cn(pillBase, "border-[var(--border)] opacity-95")}
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
            className={cn(pillBase, "border-[var(--border)]")}
          >
            <Icon name="tierGold" aria-hidden className="h-3.5 w-3.5" />
            <span className="sr-only">Featured gold</span>
          </span>
        ) : tier === "diamond" ? (
          <span
            data-testid="featured-tier-diamond"
            aria-label="Featured tier diamond"
            title="Featured diamond"
            className={cn(pillBase, "border-[var(--border)]")}
          >
            <Icon name="tierDiamond" aria-hidden className="h-3.5 w-3.5" />
            <span className="sr-only">Featured diamond</span>
          </span>
        ) : (
          <span
            data-testid="featured-tier-basic"
            aria-label="Featured tier basic"
            title="Featured basic"
            className={cn(pillBase, "border-[var(--border)]")}
          >
            <Icon name="tierBasic" aria-hidden className="h-3.5 w-3.5" />
            <span className="sr-only">Featured basic</span>
          </span>
        )
      ) : null}
    </div>
  );
}

export default function ListingCard({
  id,
  href,
  title,
  price,
  currency = "KES",
  imageUrl,
  location,

  verified,
  featuredTier,
  sellerVerified,
  sellerFeaturedTier,
  sellerBadges,

  saved = false,
  kind = "product",
  conditionLabel,
  featured = false,
  className,
  ratingAverage,
  ratingCount,
  editHref,
  editLabel,
  onToggleSaveAction,
  onViewAction,
  onEditAction,
  onDonateAction,
}: ListingCardProps) {
  const router = useRouter();
  const [isSaved, setIsSaved] = React.useState(!!saved);
  const [busy, setBusy] = React.useState(false);
  const [donating, setDonating] = React.useState(false);

  const priceText = formatPrice(price, currency, kind);
  const showEdit = !!editHref;
  const showDonate = typeof onDonateAction === "function";

  const hasRating =
    typeof ratingAverage === "number" &&
    ratingAverage > 0 &&
    typeof ratingCount === "number" &&
    ratingCount > 0;

  const badgesObj =
    sellerBadges &&
    typeof sellerBadges === "object" &&
    !Array.isArray(sellerBadges)
      ? sellerBadges
      : null;

  /**
   * Resolver: pick the first VALID value across sources (so null/undefined in sellerBadges
   * won't suppress a valid legacy/canonical value).
   */
  const tier = React.useMemo<FeaturedTier | null>(() => {
    const fromBadges = normalizeTier((badgesObj as any)?.tier);
    if (fromBadges) return fromBadges;

    const fromCanonical =
      featuredTier !== undefined ? normalizeTier(featuredTier) : null;
    if (fromCanonical) return fromCanonical;

    const fromLegacy =
      sellerFeaturedTier !== undefined
        ? normalizeTier(sellerFeaturedTier)
        : null;
    return fromLegacy;
  }, [badgesObj, featuredTier, sellerFeaturedTier]);

  const effectiveVerified = React.useMemo<boolean | null>(() => {
    const vb = (badgesObj as any)?.verified;
    if (typeof vb === "boolean") return vb;

    if (typeof verified === "boolean") return verified;
    if (typeof sellerVerified === "boolean") return sellerVerified;

    return null;
  }, [badgesObj, verified, sellerVerified]);

  const sellerBadgesResolved = React.useMemo<SellerBadges>(
    () => ({ verified: effectiveVerified, tier }),
    [effectiveVerified, tier],
  );

  async function handleSaveToggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const next = !isSaved;
    setIsSaved(next); // optimistic
    try {
      setBusy(true);
      await onToggleSaveAction?.(next);
    } catch {
      setIsSaved(!next); // revert on failure
    } finally {
      setBusy(false);
    }
  }

  async function handleViewClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await onViewAction?.();
    } catch {
      // ignore analytics failures
    }
    router.push(href);
  }

  async function handleEditClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const dest = editHref;
    if (!dest) return;
    try {
      await onEditAction?.();
    } catch {
      // ignore analytics failures
    }
    router.push(dest);
  }

  async function handleDonateClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!onDonateAction || donating) return;
    try {
      setDonating(true);
      await onDonateAction();
    } catch {
      // ignore failures; parent can handle errors/toasts
    } finally {
      setDonating(false);
    }
  }

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-[var(--bg-elevated)] text-[var(--text)]",
        "border-[var(--border-subtle)] shadow-sm transition hover:border-[var(--border)]",
        featured && "ring-1 ring-focus",
        className,
      )}
      data-listing-id={id}
      data-listing-kind={kind}
      {...(hasRating
        ? { "data-rating-avg": ratingAverage, "data-rating-count": ratingCount }
        : {})}
      role="article"
    >
      {/* Single canonical Link for the main click surface */}
      <Link
        href={href}
        prefetch={false}
        aria-labelledby={`listing-${id}-title`}
        className="relative block"
      >
        {/* Cover */}
        <div className="relative overflow-hidden">
          {/* Phone-first media height (more cards above fold) */}
          <div className="relative h-36 w-full min-[420px]:h-40 sm:h-44">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 33vw, 25vw"
                className={cn(
                  "object-cover transition-transform duration-300",
                  "group-hover:scale-[1.03]",
                )}
                priority={false}
              />
            ) : (
              <div className="grid h-full w-full place-items-center bg-[var(--bg-subtle)]">
                <Icon
                  name="image"
                  className="opacity-50 text-[var(--text-muted)]"
                />
              </div>
            )}
          </div>

          {/* Favorite with subtle backdrop for legibility */}
          <button
            type="button"
            onClick={handleSaveToggle}
            aria-pressed={isSaved ? "true" : "false"}
            aria-label={isSaved ? "Unfavorite" : "Favorite"}
            className={cn(
              "absolute right-2 top-2 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full",
              "border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm backdrop-blur-md",
              "transition hover:bg-[var(--bg-subtle)]",
              "active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus",
              isSaved && "ring-2 ring-focus",
            )}
            disabled={busy}
          >
            <Icon
              name="heart"
              size="sm"
              className={cn(
                isSaved ? "text-[var(--text)]" : "text-[var(--text-muted)]",
              )}
              aria-hidden
            />
          </button>

          {/* Price badge */}
          <div className="absolute left-2 top-2 z-10">
            <Badge tone="indigo" variant="soft" glow>
              {priceText}
            </Badge>
          </div>

          {/* Seller badges overlay (must be inside the Link anchor for E2E) */}
          <div className="pointer-events-none absolute left-2 top-10 sm:top-12 z-10">
            <VerifiedBadge sellerBadges={sellerBadgesResolved} />
          </div>

          {/* Bottom overlay + meta */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-14 sm:h-20 bg-[var(--bg-elevated)] opacity-90"
            aria-hidden
          />
          <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3 text-[var(--text)]">
            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-[var(--text-muted)]">
              {location ? (
                <span className="flex items-center gap-1 min-w-0">
                  <Icon name="pin" size="xs" aria-hidden className="shrink-0" />
                  <span className="truncate">{location}</span>
                </span>
              ) : null}
              {conditionLabel ? (
                <span className="hidden sm:inline">• {conditionLabel}</span>
              ) : null}
              {kind === "service" ? (
                <span className="hidden sm:inline">• Service</span>
              ) : null}
            </div>
            <h3
              id={`listing-${id}-title`}
              className="mt-1 line-clamp-1 sm:line-clamp-2 text-sm sm:text-base font-semibold leading-snug"
            >
              {title}
            </h3>
          </div>
        </div>

        {/* Footer row: rating + View/Edit/Support actions */}
        <div className="flex items-center justify-between gap-2 px-2.5 py-2.5 sm:px-3 sm:py-3">
          <div className="flex flex-col gap-1 text-[11px] sm:text-xs text-[var(--text-muted)]">
            {hasRating && (
              <div
                className="flex items-center gap-1.5"
                aria-label={`${ratingAverage?.toFixed(
                  1,
                )} out of 5 stars from ${ratingCount} reviews`}
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

          <div className="flex items-center gap-1.5">
            {showDonate && (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="px-2 py-1 text-xs sm:text-sm"
                onClick={handleDonateClick}
                disabled={donating}
              >
                {donating ? "Working…" : "Support"}
              </Button>
            )}

            <Button
              type="button"
              size="xs"
              variant="subtle"
              className="px-2 py-1 text-xs sm:text-sm"
              onClick={handleViewClick}
            >
              View <span className="sr-only">{title}</span>
            </Button>

            {showEdit && (
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="px-2 py-1 text-xs sm:text-sm"
                onClick={handleEditClick}
              >
                {editLabel || "Edit"} <span className="sr-only">{title}</span>
              </Button>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}
