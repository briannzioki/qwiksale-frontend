// src/app/components/VerifiedBadge.tsx
"use client";

import * as React from "react";
import { Badge } from "@/app/components/Badge";
import { Icon } from "@/app/components/Icon";

export type FeaturedTier = "basic" | "gold" | "diamond";

export type SellerBadgesWire = {
  verified?: boolean | null;
  tier?: FeaturedTier | string | null;
} | null;

export type VerifiedBadgeProps = {
  className?: string;

  /**
   * Canonical verification state (preferred).
   * - true/false => renders Verified/Unverified
   * - null => "unknown" (do not render verification pill)
   * - undefined => unknown (may fall back to sellerBadges if provided)
   */
  verified?: boolean | null;

  /**
   * Back-compat highlight flag (DO NOT infer tier from this).
   * Kept only for older callers.
   */
  featured?: boolean | null;

  /**
   * Canonical featured tier (preferred).
   * Must normalize to "basic" | "gold" | "diamond"; otherwise null.
   * If undefined, may fall back to sellerBadges if provided.
   */
  featuredTier?: FeaturedTier | string | null;

  /**
   * Preferred consolidated badge payload from APIs/callers.
   */
  sellerBadges?: SellerBadgesWire;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function normalizeTier(v: unknown): FeaturedTier | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  if (t === "basic" || t === "gold" || t === "diamond") return t as FeaturedTier;
  return null;
}

function TierIcon({ tier }: { tier: FeaturedTier }) {
  // minimal inline glyphs to avoid coupling to Icon-name unions
  if (tier === "diamond") {
    return (
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="h-3 w-3 sm:h-3.5 sm:w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      >
        <path d="M12 3 3.5 9l8.5 12 8.5-12L12 3Z" />
        <path d="M3.5 9H20.5" />
        <path d="M12 3 8 9l4 12 4-12-4-6Z" />
      </svg>
    );
  }
  if (tier === "gold") {
    return (
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="h-3 w-3 sm:h-3.5 sm:w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 18h14" />
        <path d="M7 18V9l5 3 5-3v9" />
        <path d="M7 9 5 6l3 1 4-3 4 3 3-1-2 3" />
      </svg>
    );
  }
  // basic
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-3 w-3 sm:h-3.5 sm:w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l2.6 6.2 6.7.6-5 4.3 1.5 6.5L12 17.9 6.2 20.6l1.5-6.5-5-4.3 6.7-.6L12 3Z" />
    </svg>
  );
}

export default function VerifiedBadge({
  className = "",
  verified,
  featured, // kept for back-compat; intentionally not used to infer tier
  featuredTier,
  sellerBadges,
}: VerifiedBadgeProps) {
  // Avoid unused-local noise while keeping the prop for older callers.
  void featured;

  const badgesObj =
    sellerBadges && typeof sellerBadges === "object" && !Array.isArray(sellerBadges)
      ? sellerBadges
      : null;

  const hasBadgesVerified = !!badgesObj && "verified" in (badgesObj as object);
  const hasBadgesTier = !!badgesObj && "tier" in (badgesObj as object);

  // ✅ If canonical props are provided (even null), do not re-resolve from legacy payloads.
  const verifiedProvided = verified !== undefined;
  const tierProvided = featuredTier !== undefined;

  const resolvedVerified: boolean | null = (() => {
    if (verifiedProvided) {
      return typeof verified === "boolean" ? verified : null;
    }
    if (hasBadgesVerified) {
      const v = (badgesObj as any)?.verified;
      return typeof v === "boolean" ? v : null;
    }
    return null;
  })();

  const resolvedTier: FeaturedTier | null = (() => {
    if (tierProvided) {
      const t = normalizeTier(featuredTier);
      return t ?? null;
    }
    if (hasBadgesTier) {
      const t = normalizeTier((badgesObj as any)?.tier);
      return t ?? null;
    }
    return null;
  })();

  const showVerified = typeof resolvedVerified === "boolean";
  const showTier =
    resolvedTier === "basic" || resolvedTier === "gold" || resolvedTier === "diamond";

  if (!showVerified && !showTier) return null;

  const tierTone =
    resolvedTier === "gold" ? "amber" : resolvedTier === "diamond" ? "indigo" : "slate";

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1 sm:gap-1.5", className)}>
      {showVerified ? (
        <span
          data-testid={resolvedVerified ? "verified-badge" : "unverified-badge"}
          aria-label={resolvedVerified ? "Verified seller" : "Unverified seller"}
          title={resolvedVerified ? "Verified seller" : "Unverified seller"}
          className="inline-flex"
        >
          <Badge
            tone={resolvedVerified ? "green" : "slate"}
            variant="soft"
            size="xs"
            glow={Boolean(resolvedVerified)}
            icon={<Icon name={resolvedVerified ? "verified" : "info"} size="xs" aria-hidden />}
          >
            {resolvedVerified ? "Verified" : "Unverified"}
          </Badge>
        </span>
      ) : null}

      {showTier ? (
        <span
          data-testid={`featured-tier-${resolvedTier}`}
          aria-label={`Featured ${resolvedTier}`}
          title={`Featured ${resolvedTier}`}
          className="inline-flex"
        >
          <Badge tone={tierTone} variant="soft" size="xs" glow={resolvedTier !== "basic"} icon={<TierIcon tier={resolvedTier} />}>
            <span className="sr-only">{`Featured ${resolvedTier}`}</span>
          </Badge>
        </span>
      ) : null}
    </span>
  );
}
