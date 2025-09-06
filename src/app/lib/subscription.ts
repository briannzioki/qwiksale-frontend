/* ------------------------------------------------------------------ */
/* Types & constants                                                  */
/* ------------------------------------------------------------------ */

export type Tier = "BASIC" | "GOLD" | "PLATINUM";

/** Sort order & comparisons (higher is better). */
const TIER_RANK: Record<Tier, number> = {
  BASIC: 0,
  GOLD: 1,
  PLATINUM: 2,
};

/** Human labels + (optional) perks for UI. */
export const TIER_META: Record<Tier, { label: string; perks: string[] }> = {
  BASIC: {
    label: "Free",
    perks: [
      "Post standard listings",
      "Basic search & favorites",
      "Community support",
    ],
  },
  GOLD: {
    label: "Gold",
    perks: [
      "Verified badge on listings",
      "Boosted placement",
      "Priority support",
    ],
  },
  PLATINUM: {
    label: "Platinum",
    perks: [
      "Top placement & spotlight",
      "Storefront branding",
      "Priority + concierge support",
    ],
  },
};

/* ------------------------------------------------------------------ */
/* Date utilities                                                     */
/* ------------------------------------------------------------------ */

/** Parse various date inputs; returns null if invalid. */
export function toDate(d?: Date | string | null): Date | null {
  if (!d) return null;
  const v = typeof d === "string" ? new Date(d) : d;
  return Number.isFinite(+v) ? v : null;
}

/** True if `until` is in the future (i.e., benefits active). */
export function isActive(until?: Date | string | null): boolean {
  const exp = toDate(until);
  return !!exp && +exp > Date.now();
}

/** Days (ceil) remaining until `until`; 0 if expired/invalid. */
export function daysLeft(until?: Date | string | null): number {
  const exp = toDate(until);
  if (!exp) return 0;
  const diff = +exp - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

/** ISO 8601 string (without milliseconds) for nice logs/UI. */
export function toISODate(d: Date): string {
  return new Date(d.getTime() - d.getMilliseconds()).toISOString();
}

/* ------------------------------------------------------------------ */
/* Core logic                                                         */
/* ------------------------------------------------------------------ */

/**
 * Returns the *effective* tier considering expiration.
 * If `until` is in the past/invalid → BASIC.
 */
export function effectiveTier(tier: Tier, until?: Date | string | null): Tier {
  return isActive(until) ? tier : "BASIC";
}

/**
 * Normalize any string to a valid `Tier` (fallback BASIC).
 */
export function normalizeTier(t?: string | null): Tier {
  const x = String(t || "").toUpperCase();
  return (["BASIC", "GOLD", "PLATINUM"] as const).includes(x as Tier)
    ? (x as Tier)
    : "BASIC";
}

/** Compare tiers: > 0 if a > b, 0 equal, < 0 if a < b. */
export function compareTiers(a: Tier, b: Tier): number {
  return TIER_RANK[a] - TIER_RANK[b];
}

/** True if `a` is at least as high as `b`. */
export function gteTier(a: Tier, b: Tier): boolean {
  return compareTiers(a, b) >= 0;
}

/* ------------------------------------------------------------------ */
/* Extensions / renewals                                              */
/* ------------------------------------------------------------------ */

/**
 * Add N days to an existing or new base:
 * - If `base` is in the future → extend from that future date.
 * - Else → extend from now.
 */
export function extendByDays(base?: Date | string | null, days = 30): Date {
  const now = new Date();
  const b = toDate(base);
  const start = b && +b > +now ? new Date(b) : now;
  const out = new Date(start);
  out.setDate(out.getDate() + Math.max(1, Math.floor(days)));
  return out;
}

/** Same as `extendByDays`, but in months (calendar-aware). */
export function extendByMonths(base?: Date | string | null, months = 1): Date {
  const now = new Date();
  const b = toDate(base);
  const start = b && +b > +now ? new Date(b) : now;
  const out = new Date(start);
  out.setMonth(out.getMonth() + Math.max(1, Math.floor(months)));
  return out;
}

/** Convenience: given current tier/until, extend and return new ISO string. */
export function renewTierUntil(
  currentUntil?: Date | string | null,
  opts: { days?: number; months?: number } = { days: 30 }
): string {
  const next =
    typeof opts.months === "number"
      ? extendByMonths(currentUntil, opts.months)
      : extendByDays(currentUntil, opts.days ?? 30);
  return toISODate(next);
}

/* ------------------------------------------------------------------ */
/* UI helpers                                                         */
/* ------------------------------------------------------------------ */

/** Label like "Gold (12 days left)" or "Free". */
export function tierDisplay(tier: Tier, until?: Date | string | null): string {
  const eff = effectiveTier(tier, until);
  const meta = TIER_META[eff].label;
  if (eff === "BASIC") return meta;
  const d = daysLeft(until);
  return d > 0 ? `${meta} (${d} day${d === 1 ? "" : "s"} left)` : meta;
}

/** Quick boolean: can use “verified/featured” features? */
export function canUseFeatured(effTier: Tier): boolean {
  return gteTier(effTier, "GOLD");
}

/* ------------------------------------------------------------------ */
/* App-facing helpers                                                 */
/* ------------------------------------------------------------------ */

type UserSubset = {
  subscription: Tier | string | null | undefined;
  subscriptionUntil?: string | Date | null | undefined;
};

/** Derive the *effective* tier from a user row (tolerates bad data). */
export function effectiveTierFromUser(user: UserSubset): Tier {
  const tier = normalizeTier(user?.subscription as string | null);
  return effectiveTier(tier, user?.subscriptionUntil ?? null);
}

/** Guard: throw if a user can’t use featured/verified perks. */
export function assertCanUseFeatured(user: UserSubset): void {
  const eff = effectiveTierFromUser(user);
  if (!canUseFeatured(eff)) {
    const left = daysLeft(user.subscriptionUntil ?? null);
    const note = left > 0 ? ` (${left} day${left === 1 ? "" : "s"} left)` : "";
    throw Object.assign(
      new Error("Upgrade required: Gold or Platinum needed to feature listings."),
      { code: "UPGRADE_REQUIRED", tier: eff, daysLeft: left, note }
    );
  }
}

/** Pretty badge text for UI elements. */
export function tierBadge(user: UserSubset): string {
  const eff = effectiveTierFromUser(user);
  return tierDisplay(eff, user.subscriptionUntil ?? null);
}
