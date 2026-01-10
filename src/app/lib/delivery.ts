/**
 * Delivery shared utilities
 * - request types and simple validation helpers
 * - basic "vehicle fit" rules for deliveries
 *
 * This module is intentionally light and tolerant of schema evolution.
 */

export type DeliveryRequestType = "DELIVERY" | "CONFIRM_AVAILABILITY" | (string & {});

export type DeliveryRequestStatus =
  | "OPEN"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED"
  | (string & {});

export type VehicleType =
  | "BIKE"
  | "MOTORBIKE"
  | "CAR"
  | "VAN"
  | "TRUCK"
  | (string & {});

export type DeliverySize = "SMALL" | "MEDIUM" | "LARGE" | "BULKY" | (string & {});

export type DeliveryContext = {
  type: DeliveryRequestType;
  size?: DeliverySize | null;
  // Optional hints for product/store flows
  productId?: string | null;
  storeId?: string | null;
};

export const DELIVERY_REQUEST_TYPES: readonly DeliveryRequestType[] = ["DELIVERY", "CONFIRM_AVAILABILITY"] as const;

export function normalizeRequestType(v: unknown): DeliveryRequestType | null {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "DELIVERY" || s === "CONFIRM_AVAILABILITY") return s;
  return null;
}

export function normalizeVehicleType(v: unknown): VehicleType | null {
  const s = String(v ?? "").trim().toUpperCase();
  if (!s) return null;
  return s as VehicleType;
}

export function normalizeDeliverySize(v: unknown): DeliverySize | null {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "SMALL" || s === "MEDIUM" || s === "LARGE" || s === "BULKY") return s;
  return null;
}

/**
 * Simple rules:
 * - CONFIRM_AVAILABILITY is always "fit" for any vehicle (it's a contact/availability ping).
 * - DELIVERY uses size -> minimum viable vehicle tiers.
 *
 * Returns:
 * - ok: whether the vehicle can handle the request
 * - score: bigger is better match (useful for ranking carriers in future)
 */
export function vehicleFit(
  vehicleType: VehicleType | string | null | undefined,
  ctx: DeliveryContext,
): { ok: boolean; score: number; reason?: string } {
  const vt = String(vehicleType ?? "").toUpperCase();

  const reqType = String(ctx?.type ?? "").toUpperCase();
  if (reqType === "CONFIRM_AVAILABILITY") {
    if (!vt) return { ok: false, score: 0, reason: "Missing vehicle type" };
    return { ok: true, score: 50 };
  }

  const size = String(ctx?.size ?? "MEDIUM").toUpperCase();

  const tiers: Record<string, number> = {
    BIKE: 1,
    MOTORBIKE: 2,
    CAR: 3,
    VAN: 4,
    TRUCK: 5,
  };

  const vehicleTier = tiers[vt] ?? 0;

  const requiredTier =
    size === "SMALL"
      ? 1
      : size === "MEDIUM"
        ? 2
        : size === "LARGE"
          ? 3
          : size === "BULKY"
            ? 4
            : 2;

  const ok = vehicleTier >= requiredTier;

  // Score gives a mild bonus to better-matched vehicles.
  // Keep it simple: base match score + extra tier buffer.
  const score = ok ? 100 + Math.max(0, vehicleTier - requiredTier) * 10 : 0;

  if (!vt) return { ok: false, score: 0, reason: "Missing vehicle type" };
  if (!ok) return { ok: false, score: 0, reason: `Vehicle ${vt} may not fit ${size} deliveries` };

  return { ok: true, score };
}

export function defaultSizeForProductContext(productId?: string | null): DeliverySize {
  // Conservative default: most marketplace items are small/medium.
  // This can be upgraded later using product category/weight if your schema exposes it.
  void productId;
  return "MEDIUM";
}
