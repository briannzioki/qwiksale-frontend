// Minimal helpers for resolving a seller username and providing a safe fallback.

function cleanUsername(raw?: string | null): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  // Allow letters, digits, dot, underscore and hyphen; 2..32 chars.
  return /^[a-z0-9._-]{2,32}$/i.test(v) ? v : "";
}

/** Pull a username out of a product-ish object across common shapes. */
export function usernameFromProduct(p: any): string | null {
  if (!p || typeof p !== "object") return null;

  const tryKeys = (obj: any, keys: string[]) => {
    if (!obj) return null;
    for (const k of keys) {
      const v = obj?.[k];
      const c = cleanUsername(typeof v === "string" ? v : null);
      if (c) return c;
    }
    return null;
  };

  // Nested user-like objects
  const nested =
    tryKeys(p.seller, ["username", "handle", "slug"]) ||
    tryKeys(p.owner, ["username", "handle", "slug"]) ||
    tryKeys(p.user, ["username", "handle", "slug"]) ||
    tryKeys(p.vendor, ["username", "handle", "slug"]) ||
    tryKeys(p?.seller?.store, ["slug", "username", "handle"]) ||
    tryKeys(p?.owner?.store, ["slug", "username", "handle"]) ||
    tryKeys(p?.user?.store, ["slug", "username", "handle"]) ||
    tryKeys(p?.vendor?.store, ["slug", "username", "handle"]);

  if (nested) return nested;

  // Flat fields placed on the product
  const flat =
    tryKeys(p, [
      "sellerUsername",
      "username",
      "store",
      "storeSlug",
      "sellerSlug",
      "shop",
      "shopSlug",
      "merchant",
      "merchantSlug",
      "storefront",
      "storefrontSlug",
      "storeName",
      "seller",
    ]) || null;

  return flat;
}

/** Try to find a stable seller id in various common fields. */
export function sellerIdFromProduct(p: any): string | null {
  if (!p || typeof p !== "object") return null;
  const candidates = [
    p.sellerId,
    p.ownerId,
    p.userId,
    p.vendorId,
    p.seller?.id,
    p.owner?.id,
    p.user?.id,
    p.vendor?.id,
  ]
    .map((x) => (typeof x === "string" && x.trim() ? x.trim() : null))
    .filter(Boolean) as string[];

  return candidates[0] || null;
}

/** Return username or fallback like "u-<sellerId>" (or "unknown" if nothing). */
export function usernameOrFallback(p: any): string {
  const u = usernameFromProduct(p);
  if (u) return u;

  const sid = sellerIdFromProduct(p);
  if (sid) return `u-${sid}`.slice(0, 40); // clamp length a bit

  return "unknown";
}
