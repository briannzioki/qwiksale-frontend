"use client";

import * as React from "react";
import { Badge } from "@/app/components/Badge";
import { Icon } from "@/app/components/Icon";

export type FeaturedTier = "basic" | "gold" | "diamond";

export type VerifiedBadgeProps = {
  className?: string;

  /**
   * Explicit verification state.
   * - true/false => renders Verified/Unverified
   * - null => treat as "no data" (do not render verification pill)
   * - undefined => legacy behavior (renders Verified)
   */
  verified?: boolean | null;

  /**
   * Back-compat: older payloads may only have a boolean "featured".
   * If true and featuredTier is missing, we treat tier as "basic".
   */
  featured?: boolean | null;

  /**
   * Preferred: tier string from payload ("basic" | "gold" | "diamond").
   * Can be any string; we normalize/ignore unknown values.
   */
  featuredTier?: FeaturedTier | string | null;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function normalizeTier(v: unknown): FeaturedTier | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  if (t === "basic" || t === "gold" || t === "diamond") return t;
  return null;
}

export default function VerifiedBadge({
  className = "",
  verified,
  featured,
  featuredTier,
}: VerifiedBadgeProps) {
  const hasExplicitVerified = verified === true || verified === false;

  // Legacy behavior: if caller didn't pass "verified" at all, old component always showed Verified.
  const legacyVerified = verified === undefined;
  const showVerified = hasExplicitVerified || legacyVerified;
  const isVerified = hasExplicitVerified ? verified : true;

  const tierFromProp = normalizeTier(featuredTier);
  const tier: FeaturedTier | null = tierFromProp ?? (featured ? "basic" : null);
  const showTier = Boolean(tier);

  if (!showVerified && !showTier) return null;

  const tierTone =
    tier === "gold" ? "amber" : tier === "diamond" ? "indigo" : "slate";
  const tierIcon =
    tier === "gold" ? "tierGold" : tier === "diamond" ? "tierDiamond" : "tierBasic";

  return (
    <span
      className={cn("inline-flex flex-wrap items-center gap-1.5", className)}
      data-testid="verified-badge"
    >
      {showVerified ? (
        <Badge
          tone={isVerified ? "green" : "slate"}
          variant="soft"
          size="xs"
          glow={Boolean(isVerified)}
          icon={
            <Icon
              name={isVerified ? "verified" : "info"}
              size="xs"
              aria-hidden
            />
          }
          title={isVerified ? "Verified seller" : "Unverified seller"}
        >
          {isVerified ? "Verified" : "Unverified"}
        </Badge>
      ) : null}

      {showTier ? (
        <Badge
          tone={tierTone}
          variant="soft"
          size="xs"
          glow={tier !== "basic"}
          icon={<Icon name={tierIcon} size="xs" aria-hidden />}
          title={`Featured tier: ${tier}`}
          data-testid="featured-tier-badge"
        >
          Featured {tier}
        </Badge>
      ) : null}
    </span>
  );
}
