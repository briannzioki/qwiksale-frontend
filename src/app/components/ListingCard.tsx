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
import VerifiedBadge from "@/app/components/VerifiedBadge";

type Kind = "product" | "service";

export type ListingCardProps = {
  id: string;
  href: string;
  title: string;
  price: number | string;
  currency?: "KES" | string;
  imageUrl?: string | null;
  location?: string;
  verified?: boolean;
  saved?: boolean;
  kind?: Kind;
  conditionLabel?: string;

  /** Back-compat highlight flag (also used for ring). */
  featured?: boolean;

  /** Preferred featured tier (basic/gold/diamond) when available. */
  featuredTier?: "basic" | "gold" | "diamond" | string | null;

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

function SellerTextBadges({
  verified,
  tier,
}: {
  verified?: boolean;
  tier?: "basic" | "gold" | "diamond" | null;
}) {
  const showVerified = typeof verified === "boolean";
  const showTier = tier === "basic" || tier === "gold" || tier === "diamond";
  if (!showVerified && !showTier) return null;

  const pillBase =
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {showVerified ? (
        verified ? (
          <span
            className={cn(
              pillBase,
              "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200",
            )}
          >
            <span aria-hidden>✓</span>
            {" "}
            <span>Verified</span>
          </span>
        ) : (
          <span
            className={cn(
              pillBase,
              "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200",
            )}
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
            className={cn(
              pillBase,
              "border-yellow-300 bg-gradient-to-r from-yellow-200 via-yellow-100 to-yellow-300 text-yellow-950 dark:border-yellow-900/40 dark:from-yellow-900/30 dark:via-yellow-900/10 dark:to-yellow-900/30 dark:text-yellow-100",
            )}
          >
            <span aria-hidden>★</span>
            {" "}
            <span>Featured Gold</span>
          </span>
        ) : tier === "diamond" ? (
          <span
            className={cn(
              pillBase,
              "border-indigo-300 bg-gradient-to-r from-sky-200 via-indigo-100 to-violet-200 text-slate-950 dark:border-indigo-900/40 dark:from-indigo-900/30 dark:via-indigo-900/10 dark:to-indigo-900/30 dark:text-slate-100",
            )}
          >
            <span aria-hidden>💎</span>
            {" "}
            <span>Featured Diamond</span>
          </span>
        ) : (
          <span className={cn(pillBase, "border-border bg-muted text-foreground")}>
            <span aria-hidden>★</span>
            {" "}
            <span>Featured Basic</span>
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
  saved = false,
  kind = "product",
  conditionLabel,
  featured = false,
  featuredTier,
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

  const tier = React.useMemo<"basic" | "gold" | "diamond" | null>(() => {
    if (typeof featuredTier === "string") {
      const t = featuredTier.trim().toLowerCase();
      if (t === "basic" || t === "gold" || t === "diamond") return t;
    }
    return featured ? "basic" : null;
  }, [featuredTier, featured]);

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
        "border-[var(--border-subtle)] transition hover:border-[var(--border)]",
        featured && "ring-1 ring-focus",
        className,
      )}
      data-listing-id={id}
      data-listing-kind={kind}
      {...(hasRating
        ? {
            "data-rating-avg": ratingAverage,
            "data-rating-count": ratingCount,
          }
        : {})}
      role="article"
    >
      {/* Single canonical Link for the main click surface */}
      <Link href={href} prefetch={false} aria-labelledby={`listing-${id}-title`}>
        {/* Cover */}
        <div className="relative overflow-hidden">
          <div className="w-full" style={{ aspectRatio: "4 / 3" }}>
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
              <div className="grid h-full w-full place-items-center bg-muted">
                <Icon name="image" className="opacity-40 text-muted-foreground" />
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
              "border border-border/60 bg-card/80 text-[var(--text)] shadow-sm backdrop-blur-md",
              "transition hover:bg-card",
              isSaved && "ring-2 ring-focus",
            )}
            disabled={busy}
          >
            <Icon
              name="heart"
              className={cn(
                "text-sm",
                isSaved ? "text-pink-500" : "text-muted-foreground",
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

          {/* Bottom overlay + meta */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"
            aria-hidden
          />
          <div className="absolute inset-x-0 bottom-0 p-3 md:p-3.5 text-white">
            <div className="flex items-center gap-1.5 text-xs opacity-90">
              {typeof verified === "boolean" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-semibold">
                  <Icon
                    name="verified"
                    className={verified ? "text-emerald-300" : "text-amber-300"}
                    aria-hidden
                  />
                  <span>{verified ? "Verified" : "Unverified"}</span>
                </span>
              ) : null}

              {location ? (
                <span className="flex items-center gap-1">
                  <Icon name="pin" aria-hidden />
                  {location}
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
              className="mt-1 line-clamp-2 text-sm font-semibold leading-snug drop-shadow"
            >
              {title}
            </h3>
          </div>
        </div>

        {/* Footer row: rating + badges + View/Edit/Support actions */}
        <div className="flex items-center justify-between gap-2 px-3 py-3">
          <div className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
            {hasRating && (
              <div
                className="flex items-center gap-1.5"
                aria-label={`${ratingAverage?.toFixed(1)} out of 5 stars from ${ratingCount} reviews`}
              >
                <ReviewStars rating={ratingAverage || 0} />
                <span className="font-medium">{ratingAverage?.toFixed(1)}</span>
                <span className="text-[0.7rem] text-muted-foreground">
                  ({ratingCount})
                </span>
              </div>
            )}

            <div className="flex flex-col gap-1">
              {/* Keep your existing badge component for styling/consistency */}
              <VerifiedBadge
                verified={typeof verified === "boolean" ? verified : null}
                featured={featured}
                featuredTier={tier}
              />
              {/* Add explicit visible text for Playwright assertions */}
              <SellerTextBadges
                {...(typeof verified === "boolean" ? { verified } : {})}
                tier={tier}
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {showDonate && (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="px-2 py-1"
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
              className="px-2 py-1"
              onClick={handleViewClick}
            >
              View <span className="sr-only">{title}</span>
            </Button>

            {showEdit && (
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="px-2 py-1"
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
