// src/app/lib/request-limits.ts

export type SubscriptionTier = "BASIC" | "GOLD" | "PLATINUM";

export type RequestLimits = {
  tier: SubscriptionTier;
  /** Max active (non-closed, non-expired) requests user can have at once */
  maxActive: number;
  /** Rolling window cap (posts per 24h). If 0, no rolling limit enforced. */
  maxPer24h: number;
  /** Default expiry in days from create */
  expiryDays: number;
  /** Boost entitlement (whether user can boost at all) */
  canBoost: boolean;
  /** Boost duration in hours */
  boostHours: number;
  /** Boost cooldown window in hours (optional; endpoints can enforce) */
  boostCooldownHours: number;
};

function normalizeTier(input: unknown): SubscriptionTier {
  const s = String(input ?? "").toUpperCase().trim();
  if (s === "GOLD") return "GOLD";
  if (s === "PLATINUM") return "PLATINUM";
  return "BASIC";
}

export function getRequestLimits(subscription: unknown): RequestLimits {
  const tier = normalizeTier(subscription);

  // Keep these conservative; you can tune without schema changes.
  if (tier === "PLATINUM") {
    return {
      tier,
      maxActive: 20,
      maxPer24h: 20,
      expiryDays: 30,
      canBoost: true,
      boostHours: 72,
      boostCooldownHours: 12,
    };
  }

  if (tier === "GOLD") {
    return {
      tier,
      maxActive: 10,
      maxPer24h: 10,
      expiryDays: 21,
      canBoost: true,
      boostHours: 48,
      boostCooldownHours: 18,
    };
  }

  return {
    tier: "BASIC",
    maxActive: 3,
    maxPer24h: 3,
    expiryDays: 14,
    canBoost: false,
    boostHours: 0,
    boostCooldownHours: 0,
  };
}

export function rolling24hWindowStart(now = new Date()): Date {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000);
}

export function computeExpiresAtForTier(subscription: unknown, now = new Date()): Date {
  const lim = getRequestLimits(subscription);
  return new Date(now.getTime() + lim.expiryDays * 24 * 60 * 60 * 1000);
}

export function computeBoostUntilForTier(subscription: unknown, now = new Date()): Date | null {
  const lim = getRequestLimits(subscription);
  if (!lim.canBoost || lim.boostHours <= 0) return null;
  return new Date(now.getTime() + lim.boostHours * 60 * 60 * 1000);
}

export type CreateRequestGateInput = {
  subscription: unknown;
  /** User ban-until timestamp; if in the future, creation blocked */
  requestBanUntil: Date | string | null | undefined;
  /** Current number of active requests */
  activeCount: number;
  /** Number created within rolling 24h window */
  createdLast24h: number;
};

export type GateResult =
  | { ok: true }
  | { ok: false; code: "BANNED" | "ACTIVE_CAP" | "WINDOW_CAP"; message: string };

export function gateCreateRequest(input: CreateRequestGateInput, now = new Date()): GateResult {
  const lim = getRequestLimits(input.subscription);

  const banUntil =
    input.requestBanUntil instanceof Date
      ? input.requestBanUntil
      : input.requestBanUntil
      ? new Date(String(input.requestBanUntil))
      : null;

  if (banUntil && Number.isFinite(banUntil.getTime()) && banUntil.getTime() > now.getTime()) {
    return { ok: false, code: "BANNED", message: "You are temporarily blocked from posting requests." };
  }

  const active = Math.max(0, Math.trunc(input.activeCount || 0));
  if (active >= lim.maxActive) {
    return { ok: false, code: "ACTIVE_CAP", message: "You have reached your active request limit." };
  }

  const inWindow = Math.max(0, Math.trunc(input.createdLast24h || 0));
  if (lim.maxPer24h > 0 && inWindow >= lim.maxPer24h) {
    return { ok: false, code: "WINDOW_CAP", message: "You have reached your request posting cap for the last 24 hours." };
  }

  return { ok: true };
}

export type BoostGateInput = {
  subscription: unknown;
  /** Current boostUntil; if still boosted, you may block (endpoint choice) */
  currentBoostUntil: Date | string | null | undefined;
  /** Optional lastBoostedAt or similar if you implement cooldown elsewhere */
  cooldownAnchor?: Date | string | null | undefined;
};

export function gateBoostRequest(input: BoostGateInput, now = new Date()): GateResult {
  const lim = getRequestLimits(input.subscription);
  if (!lim.canBoost) {
    return { ok: false, code: "ACTIVE_CAP", message: "Boosting is not available on your plan." };
  }

  const boostUntil =
    input.currentBoostUntil instanceof Date
      ? input.currentBoostUntil
      : input.currentBoostUntil
      ? new Date(String(input.currentBoostUntil))
      : null;

  if (boostUntil && Number.isFinite(boostUntil.getTime()) && boostUntil.getTime() > now.getTime()) {
    return { ok: false, code: "WINDOW_CAP", message: "This request is already boosted." };
  }

  if (lim.boostCooldownHours > 0 && input.cooldownAnchor) {
    const anchor =
      input.cooldownAnchor instanceof Date ? input.cooldownAnchor : new Date(String(input.cooldownAnchor));
    if (Number.isFinite(anchor.getTime())) {
      const nextOk = anchor.getTime() + lim.boostCooldownHours * 60 * 60 * 1000;
      if (nextOk > now.getTime()) {
        return { ok: false, code: "WINDOW_CAP", message: "Boost cooldown is still active." };
      }
    }
  }

  return { ok: true };
}

export function computeRemainingIn24h(subscription: unknown, createdLast24h: number) {
  const lim = getRequestLimits(subscription);
  if (lim.maxPer24h <= 0) return { remaining: null as number | null, cap: null as number | null };
  const used = Math.max(0, Math.trunc(createdLast24h || 0));
  return { remaining: Math.max(0, lim.maxPer24h - used), cap: lim.maxPer24h };
}
