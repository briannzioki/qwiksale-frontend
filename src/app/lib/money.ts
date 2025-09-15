// src/app/lib/money.ts
// Centralized KES money helpers (safe with exactOptionalPropertyTypes)

const KES_NUMBER = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 0,
});

/** Format a number as KES with no decimals. */
export function formatKES(amount: number): string {
  // Guard against NaN without widening type to number | undefined
  const n = Number.isFinite(amount) ? amount : 0;
  return KES_NUMBER.format(n);
}

/** Format a KES range like "KES 15,000 – 20,000". Collapses to single when equal. */
export function formatKESRange(min: number, max: number): string {
  if (max <= 0 || max === min) return formatKES(min);
  return `${formatKES(min)} – ${formatKES(max)}`;
}

/**
 * Human-friendly price description used across UI.
 * - min+max:  "KES 15,000 – 20,000"
 * - only min: "KES 15,000" (+ " (negotiable)" if negotiable)
 * - only max: "Up to KES 20,000"
 * - none:     "Contact seller"
 * - zero:     "Free"
 */
export function describePrice(
  min?: number | null,
  max?: number | null,
  negotiable: boolean = false,
  labels: { contact?: string; free?: string; upTo?: string } = {}
): string {
  const contact = labels.contact ?? "Contact seller";
  const free = labels.free ?? "Free";
  const upTo = labels.upTo ?? "Up to";

  const hasMin = typeof min === "number" && Number.isFinite(min);
  const hasMax = typeof max === "number" && Number.isFinite(max);

  if (!hasMin && !hasMax) return contact;

  if (hasMin && (min as number) <= 0 && (!hasMax || (max as number) <= 0)) {
    return free;
  }

  if (hasMin && hasMax) {
    const lo = min as number;
    const hi = max as number;
    if (hi <= 0) return formatKES(lo);
    if (hi === lo) return formatKES(lo);
    return formatKESRange(lo, hi);
  }

  if (hasMin) {
    const base = formatKES(min as number);
    return negotiable ? `${base} (negotiable)` : base;
  }

  // only max
  return `${upTo} ${formatKES(max as number)}`;
}
