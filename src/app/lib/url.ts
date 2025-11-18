// src/app/lib/url.ts

/** ----------------------------------------------------------------
 * Base URL utilities
 * ---------------------------------------------------------------- */
export function getBaseUrl(): string {
  const nodeEnv = process.env["NODE_ENV"] || "development";

  // Public-facing / legacy explicit URL
  const explicit =
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["APP_URL"] || // legacy fallback
    "";

  const vercel = process.env["VERCEL_URL"] || "";

  // In dev / test / E2E, avoid pointing internal self-fetches at the public prod URL.
  // That can cause SSR hangs when the app is running on localhost but the env
  // is configured with a remote domain.
  if (nodeEnv !== "production") {
    // Only trust explicit if it's clearly localhost / 127.0.0.1.
    const safeExplicit =
      explicit && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(explicit)
        ? explicit
        : "";

    // Optional internal override for more control in dev/E2E.
    let base =
      process.env["APP_URL_INTERNAL"] ||
      process.env["NEXT_PUBLIC_APP_URL_INTERNAL"] ||
      safeExplicit ||
      "http://127.0.0.1:3000";

    if (!/^https?:\/\//i.test(base)) {
      base = `http://${base}`;
    }

    // Strip trailing slashes
    return base.replace(/\/+$/, "");
  }

  // Production: prefer explicit public URL, then Vercel URL, fallback to localhost.
  let base =
    explicit ||
    (vercel ? (vercel.startsWith("http") ? vercel : `https://${vercel}`) : "") ||
    "http://127.0.0.1:3000";

  if (!/^https?:\/\//i.test(base)) {
    base = `http://${base}`;
  }

  // Strip trailing slashes
  return base.replace(/\/+$/, "");
}

/** Build an absolute URL string from a path (safe on server & edge). */
export function makeAbsoluteUrl(path: string): string {
  const base = getBaseUrl();
  return new URL(path, base).toString();
}

/** Alias used by server code to hit internal API routes with absolute URLs. */
export const makeApiUrl = makeAbsoluteUrl;

/** ----------------------------------------------------------------
 * Shared Home-feed query types & normalization
 * ---------------------------------------------------------------- */
export type Mode = "all" | "products" | "services";
export type SortKey = "newest" | "featured" | "price_asc" | "price_desc";

export type HomeQuery = {
  /** UI mode → serialized as ?t=all|products|services */
  mode: Mode;

  /** Free text */
  q?: string;

  /** Facets / taxonomy */
  category?: string;
  subcategory?: string;
  brand?: string;

  /** Product-only facet (we don’t block it for “all”, backend ignores if N/A) */
  condition?: "brand new" | "pre-owned";

  /** Price range */
  minPrice?: number;
  maxPrice?: number;

  /** Flags */
  featuredOnly?: boolean;

  /** Sort / paging */
  sort?: SortKey; // default: newest
  page?: number; // default: 1
  pageSize?: number; // default: 24 (clamped 1..48)

  /** Extras */
  facets?: boolean; // ask API to include facet counts
  status?: string; // e.g. ACTIVE | ALL | etc.
};

/** Small helpers */
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const toInt = (v: unknown, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
};
const cleanStr = (v: unknown) => {
  const t = String(v ?? "").trim();
  return t ? t : undefined;
};

export function normalizeMode(raw?: unknown): Mode {
  const t = String(raw ?? "all").toLowerCase();
  if (t === "products" || t === "product" || t === "prod") return "products";
  if (t === "services" || t === "service" || t === "svc" || t === "svcs") return "services";
  return "all";
}

export function normalizeSort(raw?: unknown): SortKey {
  const s = String(raw ?? "").toLowerCase();
  if (s === "featured") return "featured";
  if (s === "price_asc" || s === "price-asc") return "price_asc";
  if (s === "price_desc" || s === "price-desc") return "price_desc";
  return "newest";
}

export function parseBool(v: unknown): boolean | undefined {
  if (v == null) return undefined;
  const t = String(v).trim().toLowerCase();
  if (["1", "true", "yes"].includes(t)) return true;
  if (["0", "false", "no"].includes(t)) return false;
  return undefined;
}

export function parsePrice(v: unknown): number | undefined {
  const raw = String(v ?? "")
    .replace(/,/g, "")
    .replace(/[^\d]/g, "");
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? clamp(n, 0, 9_999_999) : undefined;
}

/** Accepts URLSearchParams, ReadonlyURLSearchParams, or a plain object. */
export function getParam(spLike: any, key: string): string | null {
  // URLSearchParams / ReadonlyURLSearchParams
  if (spLike && typeof spLike.get === "function") {
    try {
      const v = spLike.get(key);
      return v == null ? null : String(v);
    } catch {
      /* ignore */
    }
  }
  // Plain object map
  if (spLike && typeof spLike === "object") {
    const v = (spLike as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return (v[0] as string) ?? null;
  }
  return null;
}

/**
 * Next 15 sometimes hands page `searchParams` as a Promise.
 * This helper safely awaits it and reads a key.
 */
export async function getParamAsync(
  spPromise: Promise<any> | undefined,
  key: string
): Promise<string | null> {
  if (!spPromise) return null;
  try {
    const sp = await spPromise;
    return getParam(sp, key);
  } catch {
    return null;
  }
}

/** Parse home query from params (server or client safe). */
export function parseHomeQuery(spLike: any): HomeQuery {
  const mode = normalizeMode(getParam(spLike, "t") ?? getParam(spLike, "mode"));
  const q = cleanStr(getParam(spLike, "q"));

  const category = cleanStr(getParam(spLike, "category"));
  const subcategory = cleanStr(getParam(spLike, "subcategory"));
  const brand = cleanStr(getParam(spLike, "brand"));

  const rawCond = (cleanStr(getParam(spLike, "condition")) || "").toLowerCase();
  const condition =
    rawCond === "brand new" || rawCond === "pre-owned"
      ? (rawCond as "brand new" | "pre-owned")
      : undefined;

  const minPrice = parsePrice(getParam(spLike, "minPrice"));
  const maxPrice = parsePrice(getParam(spLike, "maxPrice"));

  const featuredOnly = parseBool(getParam(spLike, "featured")) === true;

  const sort = normalizeSort(getParam(spLike, "sort"));

  const pageDefault = 1;
  const page = clamp(toInt(getParam(spLike, "page"), pageDefault), 1, 10_000);

  const psDefault = 24;
  const pageSizeRaw = getParam(spLike, "pageSize") ?? getParam(spLike, "limit");
  const pageSize = clamp(toInt(pageSizeRaw, psDefault), 1, 48);

  const facets = (getParam(spLike, "facets") || "").toLowerCase() === "true";
  const status = cleanStr(getParam(spLike, "status"));

  const out: HomeQuery = { mode, page, pageSize, sort, facets };
  if (q) out.q = q;
  if (category) out.category = category;
  if (subcategory) out.subcategory = subcategory;
  if (brand) out.brand = brand;
  if (condition) out.condition = condition;
  if (typeof minPrice === "number") out.minPrice = minPrice;
  if (typeof maxPrice === "number") out.maxPrice = maxPrice;
  if (featuredOnly) out.featuredOnly = true;
  if (status) out.status = status;

  return out;
}

/** Serialize a HomeQuery to URLSearchParams (for page hrefs or API calls). */
export function homeQueryToSearchParams(q: HomeQuery): URLSearchParams {
  const sp = new URLSearchParams();

  // Mode
  sp.set("t", q.mode);

  // Text & taxonomy
  if (q.q) sp.set("q", q.q);
  if (q.category) sp.set("category", q.category);
  if (q.subcategory) sp.set("subcategory", q.subcategory);
  if (q.brand) sp.set("brand", q.brand);
  if (q.condition) sp.set("condition", q.condition);

  // Price / flags / sort
  if (typeof q.minPrice === "number") sp.set("minPrice", String(q.minPrice));
  if (typeof q.maxPrice === "number") sp.set("maxPrice", String(q.maxPrice));
  if (q.featuredOnly) sp.set("featured", "true");
  if (q.sort && q.sort !== "newest") sp.set("sort", q.sort);

  // Paging
  if (q.page && q.page > 1) sp.set("page", String(q.page));
  if (q.pageSize && q.pageSize !== 24) sp.set("pageSize", String(clamp(q.pageSize, 1, 48)));

  // Extras
  if (q.facets) sp.set("facets", "true");
  if (q.status) sp.set("status", q.status);

  return sp;
}

/** Build a home page href (e.g., for tab switches or search submits). */
export function buildHomeHref(q: HomeQuery): string {
  const sp = homeQueryToSearchParams(q);
  return `/?${sp.toString()}`;
}

/** Build the API URL for /api/home-feed (relative path). */
export function buildHomeFeedPath(q: HomeQuery): string {
  const sp = homeQueryToSearchParams(q);
  // API accepts both pageSize and limit; we already provide pageSize
  return `/api/home-feed?${sp.toString()}`;
}

/** Convenience for server-side “warming” fetches. */
export function buildHomeFeedAbsoluteUrl(q: HomeQuery): string {
  return makeApiUrl(buildHomeFeedPath(q));
}

/** ----------------------------------------------------------------
 * Search helpers (used by header inline search)
 * ---------------------------------------------------------------- */

export type SearchHrefOptions = {
  /** Free text */
  q?: string | null;
  /** Force type tab in /search (maps to our UI) */
  type?: "all" | "product" | "service";
  /** Optional pre-filter facets (the /search page understands these) */
  brand?: string;
  category?: string;
  subcategory?: string;
};

/** Build a clean /search href. */
export function buildSearchHref(): string;
export function buildSearchHref(q: string | null | undefined): string;
export function buildSearchHref(opts: SearchHrefOptions): string;
export function buildSearchHref(arg?: string | null | SearchHrefOptions): string {
  const opts: SearchHrefOptions =
    typeof arg === "string" || arg == null ? { q: arg ?? "" } : (arg as SearchHrefOptions);

  const sp = new URLSearchParams();

  // Stable order: type → q → others (tests expect /search?type=product&q=mix)
  const type = (opts.type ?? "all").trim();
  if (type && type !== "all") sp.set("type", type);

  const term = String(opts.q ?? "").trim();
  if (term) sp.set("q", term);

  if (opts.brand?.trim()) sp.set("brand", opts.brand.trim());
  if (opts.category?.trim()) sp.set("category", opts.category.trim());
  if (opts.subcategory?.trim()) sp.set("subcategory", opts.subcategory.trim());

  const qs = sp.toString();
  return qs ? `/search?${qs}` : "/search";
}

/** Absolute URL variant (accepts same overloads). */
export function buildSearchAbsoluteUrl(): string;
export function buildSearchAbsoluteUrl(q: string | null | undefined): string;
export function buildSearchAbsoluteUrl(opts: SearchHrefOptions): string;
export function buildSearchAbsoluteUrl(arg?: string | null | SearchHrefOptions): string {
  return makeAbsoluteUrl(buildSearchHref(arg as any));
}
