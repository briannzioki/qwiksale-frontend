// src/app/lib/store.ts
// Minimal helpers for resolving a seller username and providing a safe fallback.

function normalizeSlug(raw?: string | null): string {
  let v = "";
  try {
    v = decodeURIComponent(String(raw ?? "")).trim();
  } catch {
    v = String(raw ?? "").trim();
  }
  // Strip leading @ (common in handles)
  return v.replace(/^@+/, "");
}

function isUuidish(raw: string): boolean {
  const s = String(raw || "").trim();
  return /^[0-9a-f-]{24,36}$/i.test(s);
}

function isUPrefixedUuidish(raw: string): boolean {
  const m = /^u-(.+)$/i.exec(String(raw || "").trim());
  return !!m?.[1] && isUuidish(m[1]);
}

function isStoreCodeLike(raw: string): boolean {
  const s = normalizeSlug(raw);
  if (!s) return false;
  // Store codes commonly look like: Sto-83535, sto_83535, store-83535, or just 83535
  if (/^(?:sto|store)[-_]?\d{1,18}$/i.test(s)) return true;
  if (/^\d{1,18}$/.test(s)) return true;
  return false;
}

function cleanUsername(raw?: string | null): string {
  const v = normalizeSlug(raw);
  if (!v) return "";
  // Allow letters, digits, dot, underscore and hyphen; 2..64 chars.
  // IMPORTANT: reject store-code-ish tokens so we don't build /store/Sto-12345 when sellerId exists.
  if (isStoreCodeLike(v)) return "";
  return /^[a-z0-9._-]{2,64}$/i.test(v) ? v : "";
}

/**
 * Store route tokens can be usernames OR store codes like "Sto-83535".
 * Important: reject raw ids / u-<id> so we don’t accidentally treat them as usernames.
 */
function cleanStoreToken(raw?: string | null): string {
  const v = normalizeSlug(raw);
  if (!v) return "";
  const lower = v.toLowerCase();
  if (lower === "undefined" || lower === "null") return "";
  if (v.length > 80) return "";

  // Don’t treat ids as store tokens.
  if (isUuidish(v) || isUPrefixedUuidish(v)) return "";

  // Accept username/store-code style tokens.
  return /^[a-z0-9._-]{2,80}$/i.test(v) ? v : "";
}

function cleanSellerId(raw?: unknown): string | null {
  const v = typeof raw === "string" || typeof raw === "number" ? normalizeSlug(String(raw)) : "";
  if (!v) return null;

  const s = v.trim();
  if (!s) return null;

  const lower = s.toLowerCase();
  if (lower === "undefined" || lower === "null") return null;

  if (s.length > 80) return null;
  return s;
}

function parseSellerIdFromSlug(raw?: string | null): string | null {
  const v = normalizeSlug(raw);
  const m = /^u-(.+)$/i.exec(v);
  if (m && m[1]) return cleanSellerId(m[1]);
  // Allow raw ids when they look like uuid-ish hex.
  if (isUuidish(v)) return v;
  return null;
}

/** Pull a store route token (username OR store code) out of a product-ish object across common shapes. */
export function usernameFromProduct(p: any): string | null {
  if (!p || typeof p !== "object") return null;

  const tryKeys = (obj: any, keys: string[]) => {
    if (!obj) return null;
    for (const k of keys) {
      const v = obj?.[k];
      const c = cleanStoreToken(typeof v === "string" ? v : null);
      if (c) return c;
    }
    return null;
  };

  // Store-ish nested objects (if your API returns store/storefront/shop)
  const nestedStore =
    tryKeys(p.store, ["code", "storeCode", "slug", "storeSlug", "handle", "storeHandle"]) ||
    tryKeys(p.shop, ["code", "storeCode", "slug", "storeSlug", "handle", "storeHandle"]) ||
    tryKeys(p.storefront, ["code", "storeCode", "slug", "storeSlug", "handle", "storeHandle"]) ||
    tryKeys(p?.seller?.store, ["code", "storeCode", "slug", "storeSlug", "handle", "storeHandle"]) ||
    tryKeys(p?.owner?.store, ["code", "storeCode", "slug", "storeSlug", "handle", "storeHandle"]) ||
    tryKeys(p?.user?.store, ["code", "storeCode", "slug", "storeSlug", "handle", "storeHandle"]) ||
    tryKeys(p?.vendor?.store, ["code", "storeCode", "slug", "storeSlug", "handle", "storeHandle"]);

  if (nestedStore) return nestedStore;

  // Nested user-like objects
  const nestedUser =
    tryKeys(p.seller, ["storeCode", "storeSlug", "storeHandle", "username", "handle", "slug"]) ||
    tryKeys(p.owner, ["storeCode", "storeSlug", "storeHandle", "username", "handle", "slug"]) ||
    tryKeys(p.user, ["storeCode", "storeSlug", "storeHandle", "username", "handle", "slug"]) ||
    tryKeys(p.vendor, ["storeCode", "storeSlug", "storeHandle", "username", "handle", "slug"]);

  if (nestedUser) return nestedUser;

  // Flat fields placed on the product
  const flat =
    tryKeys(p, [
      // Store-code / store-slug first (high-signal for `/store/<token>`)
      "storeCode",
      "store_code",
      "storeSlug",
      "store_slug",
      "storeHandle",
      "store_handle",
      "storePath",
      "store_path",
      "storeUrl",
      "store_url",

      // Seller-ish variants
      "sellerStoreCode",
      "sellerStoreSlug",
      "sellerStoreHandle",
      "sellerUsername",
      "username",
      "sellerSlug",
      "shopSlug",
      "merchantSlug",
      "storefrontSlug",

      // Legacy / loose fields
      "store",
      "shop",
      "merchant",
      "storefront",
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
    .map((x) => cleanSellerId(x))
    .filter(Boolean) as string[];

  return candidates[0] || null;
}

/** Return username/storeCode or fallback like "u-<sellerId>" (or "unknown" if nothing). */
export function usernameOrFallback(p: any): string {
  // Prefer a REAL username token (not store-code-ish) if present…
  const token = usernameFromProduct(p);
  const pretty = cleanUsername(token);
  if (pretty) return pretty;

  // …otherwise prefer the most reliable: sellerId.
  const sid = sellerIdFromProduct(p);
  if (sid) return `u-${sid}`;

  // Finally: if we only have a token (maybe a store code), return it.
  if (token) return token;

  return "unknown";
}

/** Return a safe store slug or null (never returns "u-unknown"). */
export function storeSlugFrom(
  input: { username?: string | null; sellerId?: string | null } | null | undefined,
): string | null {
  // Prefer real usernames (not store codes)
  const u = cleanUsername(input?.username ?? null);
  if (u) return u;

  const sid = cleanSellerId(input?.sellerId ?? null);
  if (sid) return `u-${sid}`;

  return null;
}

/** Build a safe /store/<slug> href or null. */
export function storeHrefFrom(
  input: { username?: string | null; sellerId?: string | null } | null | undefined,
): string | null {
  const slug = storeSlugFrom(input);
  if (!slug) return null;
  return `/store/${encodeURIComponent(slug)}`;
}

/** Build a safe /store/<slug> href from a product-like object. */
export function storeHrefFromProduct(p: any): string | null {
  // 1) Prefer a REAL username (not store-code-ish) for pretty URLs.
  const token = usernameFromProduct(p);
  const pretty = cleanUsername(token);
  if (pretty) return `/store/${encodeURIComponent(pretty)}`;

  // 2) Otherwise use the most reliable token: u-<sellerId>
  const sid = sellerIdFromProduct(p);
  if (sid) return `/store/${encodeURIComponent(`u-${sid}`)}`;

  // 3) Last resort: accept store-code-ish token if that's all we have
  if (token) return `/store/${encodeURIComponent(token)}`;

  // 4) If someone already gave us a store-ish slug, accept it safely.
  const maybe = parseSellerIdFromSlug(p?.storeSlug ?? p?.sellerSlug ?? p?.store ?? null);
  if (maybe) return `/store/${encodeURIComponent(`u-${maybe}`)}`;

  return null;
}
