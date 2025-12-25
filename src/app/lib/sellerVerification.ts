// src/app/lib/sellerVerification.ts

export type FeaturedTier = "basic" | "gold" | "diamond";

/**
 * Seller badges can be *unknown*.
 * - verified: boolean when known, otherwise null
 * - tier: FeaturedTier when explicitly known, otherwise null
 */
export type SellerBadges = { verified: boolean | null; tier: FeaturedTier | null };

/**
 * Canonical shape we can spread onto any API payload.
 *
 * Alignment rules:
 * - sellerVerified MUST be derived ONLY from emailVerified-like fields
 * - If emailVerified is missing/unknown -> sellerVerified is null (not false)
 * - If emailVerified is present but null -> sellerVerified is false
 * - Tier MUST be normalized to: "basic" | "gold" | "diamond" | null
 * - Back-compat aliases must NEVER drift; if unknown, keep them null too
 */
export type SellerBadgeFields = {
  sellerVerified: boolean | null;
  sellerFeaturedTier: FeaturedTier | null;
  sellerBadges: SellerBadges;

  // Back-compat aliases (intentionally redundant)
  verified: boolean | null;
  isVerified: boolean | null;
  seller_verified: boolean | null;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function isFeaturedTier(v: unknown): v is FeaturedTier {
  return v === "basic" || v === "gold" || v === "diamond";
}

/**
 * ✅ RULE: Seller Verified iff emailVerified-like field is present.
 * Returns:
 * - true/false when explicitly known
 * - null when absent/unknown (DO NOT coerce to false)
 */
export function sellerVerifiedFromEmailVerified(emailVerified: unknown): boolean | null {
  // Absent/unknown (missing property)
  if (typeof emailVerified === "undefined") return null;

  // Explicitly present but null => deterministically unverified
  if (emailVerified === null) return false;

  // Already boolean (rare, but treat as explicit)
  if (typeof emailVerified === "boolean") return emailVerified;

  // Date instance
  if (emailVerified instanceof Date) {
    const t = emailVerified.getTime();
    return Number.isFinite(t) ? true : null;
  }

  // Strings (e.g., timestamps from DB serialization)
  if (typeof emailVerified === "string") {
    const s = emailVerified.trim();
    if (!s) return null;

    const low = s.toLowerCase();
    if (low === "null" || low === "undefined" || low === "nan") return null;

    // Rare explicit falsy strings (treat as explicitly unverified)
    if (low === "false" || low === "0" || low === "no") return false;

    // Any other non-empty string implies presence (verified)
    return true;
  }

  // Numbers (rare): treat finite > 0 as present, 0 as explicitly not verified
  if (typeof emailVerified === "number") {
    if (!Number.isFinite(emailVerified)) return null;
    if (emailVerified === 0) return false;
    return emailVerified > 0;
  }

  // Any other non-null value: treat as present
  return true;
}

/**
 * Returns the first emailVerified-like value found on a user-like object.
 * IMPORTANT: if no key exists, returns undefined (not null) so callers can
 * distinguish "absent/unknown" from "present but null".
 */
export function pickEmailVerifiedFromUserLike(u: any): unknown {
  if (!u || typeof u !== "object") return undefined;

  // Prefer canonical key first
  if (hasOwn(u, "emailVerified")) return (u as any).emailVerified;

  // Common serialized aliases
  if (hasOwn(u, "email_verified")) return (u as any).email_verified;
  if (hasOwn(u, "emailVerifiedAt")) return (u as any).emailVerifiedAt;
  if (hasOwn(u, "email_verified_at")) return (u as any).email_verified_at;

  return undefined;
}

/**
 * Single tier normalizer used everywhere.
 * Accepts common plan/tier strings and normalizes to FeaturedTier.
 * Anything else => null.
 */
export function normalizeFeaturedTier(v: unknown): FeaturedTier | null {
  const pick = (x: unknown): string => {
    if (typeof x === "string") return x;

    if (isPlainObject(x)) {
      const any = x as any;
      const cand =
        any?.tier ??
        any?.featuredTier ??
        any?.featured_tier ??
        any?.plan ??
        any?.level ??
        any?.name ??
        any?.type ??
        any?.subscription ??
        any?.value ??
        "";

      if (typeof cand === "string") return cand;
    }

    return "";
  };

  const raw = pick(v).trim();
  if (!raw) return null;

  const s = raw.toLowerCase();

  // Allow "Gold plan", "DIAMOND", etc.
  if (s.includes("diamond")) return "diamond";
  if (s.includes("gold")) return "gold";

  // Common basic-ish synonyms
  if (s.includes("basic")) return "basic";
  if (s.includes("free")) return "basic";
  if (s.includes("starter")) return "basic";

  // Strict fallback: exact match only
  if (s === "basic" || s === "gold" || s === "diamond") return s;

  return null;
}

/**
 * Tier derived only when explicitly present in user-like data.
 * If absent/unknown -> null (DO NOT default to "basic" here).
 */
export function pickTierFromUserLike(u: any): FeaturedTier | null {
  if (!u || typeof u !== "object") return null;

  const v =
    (u as any)?.featuredTier ??
    (u as any)?.featured_tier ??
    (u as any)?.sellerFeaturedTier ??
    (u as any)?.seller_featured_tier ??
    (u as any)?.subscriptionTier ??
    (u as any)?.subscription_tier ??
    (u as any)?.subscription ??
    (u as any)?.plan ??
    (u as any)?.tier ??
    null;

  return normalizeFeaturedTier(v);
}

/**
 * Helper for LISTING/UI: if you have a featured flag, you may want a deterministic
 * tier for styling (default "basic") ONLY when featured === true.
 */
export function resolveFeaturedTier(
  featured: unknown,
  tierLike: unknown,
): FeaturedTier | null {
  const t = normalizeFeaturedTier(tierLike);
  if (t) return t;
  return featured === true ? "basic" : null;
}

export function buildSellerBadgeFields(
  verified: boolean | null | undefined,
  tier: FeaturedTier | null | undefined,
): SellerBadgeFields {
  const v: boolean | null = typeof verified === "boolean" ? verified : null;
  const t: FeaturedTier | null = normalizeFeaturedTier(tier) ?? null;

  return {
    sellerVerified: v,
    sellerFeaturedTier: t,
    sellerBadges: { verified: v, tier: t },

    // Back-compat aliases (must match sellerVerified; unknown stays unknown)
    verified: v,
    isVerified: v,
    seller_verified: v,
  };
}

export function resolveSellerBadgeFieldsFromUserLike(u: any): SellerBadgeFields {
  const emailVerified = pickEmailVerifiedFromUserLike(u);
  const verified = sellerVerifiedFromEmailVerified(emailVerified);
  const tier = pickTierFromUserLike(u);
  return buildSellerBadgeFields(verified, tier);
}
