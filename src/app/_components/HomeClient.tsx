"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import HomeTabs from "@/app/components/HomeTabs";
import FavoriteButton from "@/app/components/favorites/FavoriteButton";

/* ======================
   Types
   ====================== */

type Mode = "all" | "products" | "services";

/** Product item shape (backend may return nulls for some fields) */
type ProductItem = {
  type: "product";
  id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  brand?: string | null;
  condition?: "brand new" | "pre-owned" | null;
  price?: number | null;
  image?: string | null;
  featured?: boolean | null;
  location?: string | null;
  createdAt?: string | null;
};

/** Service item shape (backend may return nulls) */
type ServiceItem = {
  type: "service";
  id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  price?: number | null;
  image?: string | null;
  featured?: boolean | null;
  location?: string | null;
  createdAt?: string | null;
};

type AnyItem = ProductItem | ServiceItem;

type PageResponse<TItems> = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: TItems[];
};

type ErrorResponse = { error: string };

/* ======================
   Constants & helpers
   ====================== */
const PAGE_SIZE = 24;
const DEBOUNCE_MS = 300;
const FALLBACK_IMG = "/placeholder/default.jpg";

type SortKey = "featured" | "newest" | "price_asc" | "price_desc";
type ConditionKey = "all" | "brand new" | "pre-owned";

function toSortKey(s: string | null | undefined): SortKey {
  return s === "featured" || s === "price_asc" || s === "price_desc" || s === "newest"
    ? s
    : "newest";
}

function toConditionKey(s: string | null | undefined): ConditionKey {
  return s === "brand new" || s === "pre-owned" ? s : "all";
}

const fmtKES = (n?: number | null) =>
  typeof n === "number" && n > 0 ? `KES ${n.toLocaleString()}` : "Contact for price";

/** tiny shimmer dataURL for next/image blur placeholders */
function shimmer(width: number, height: number) {
  const svg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <defs>
      <linearGradient id="g">
        <stop stop-color="#eee" offset="20%" />
        <stop stop-color="#ddd" offset="50%" />
        <stop stop-color="#eee" offset="70%" />
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="#eee" />
    <rect id="r" width="${width}" height="${height}" fill="url(#g)" />
    <animate xlink:href="#r" attributeName="x" from="-${width}" to="${width}" dur="1.2s" repeatCount="indefinite"  />
  </svg>`;

  const encode = (str: string) =>
    typeof window === "undefined" ? Buffer.from(str, "utf8").toString("base64") : btoa(str);

  return `data:image/svg+xml;base64,${encode(svg)}`;
}

/** Image onError factory — one-arg handler to satisfy TS */
const makeOnImgError =
  (fallback: string) =>
  (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img && img.src !== fallback) img.src = fallback;
  };

/** Mini gazetteer (add more as needed) */
const KENYA_PLACES: Array<{ name: string; lat: number; lng: number; aliases?: string[] }> = [
  { name: "Nairobi", lat: -1.2921, lng: 36.8219, aliases: ["nai", "nrb"] },
  { name: "Mombasa", lat: -4.0435, lng: 39.6682 },
  { name: "Kisumu", lat: -0.0917, lng: 34.768 },
  { name: "Nakuru", lat: -0.3031, lng: 36.08 },
  { name: "Eldoret", lat: 0.5143, lng: 35.2698 },
  { name: "Thika", lat: -1.0333, lng: 37.0693 },
  { name: "Naivasha", lat: -0.7167, lng: 36.4333 },
  { name: "Nyeri", lat: -0.4176, lng: 36.951 },
  { name: "Meru", lat: 0.0463, lng: 37.6559 },
  { name: "Machakos", lat: -1.5167, lng: 37.2667 },
  { name: "Kakamega", lat: 0.2827, lng: 34.7519 },
  { name: "Kericho", lat: -0.3677, lng: 35.2831 },
  { name: "Kitale", lat: 1.0157, lng: 35.0061 },
  { name: "Malindi", lat: -3.2192, lng: 40.1169 },
  { name: "Garissa", lat: -0.4569, lng: 39.6583 },
  { name: "Embu", lat: -0.5333, lng: 37.45 },
  { name: "Nanyuki", lat: 0.0167, lng: 37.0667 },
  { name: "Lamu", lat: -2.2717, lng: 40.902 },
  { name: "Kilifi", lat: -3.6333, lng: 39.85 },
  { name: "Voi", lat: -3.3961, lng: 38.5561 },
];

/** Build lowercase lookup (includes aliases) */
const PLACE_LUT: Record<string, { name: string; lat: number; lng: number }> = (() => {
  const lut: Record<string, { name: string; lat: number; lng: number }> = {};
  for (const p of KENYA_PLACES) {
    lut[p.name.toLowerCase()] = { name: p.name, lat: p.lat, lng: p.lng };
    (p.aliases || []).forEach(
      (a) => (lut[a.toLowerCase()] = { name: p.name, lat: p.lat, lng: p.lng })
    );
  }
  return lut;
})();

function normPlaceString(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9,\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Resolve a free-text location to a known Kenyan town (best effort) */
function resolveKenyaPlace(
  free: string | null | undefined
): { name: string; lat: number; lng: number } | null {
  if (!free) return null;
  const t = normPlaceString(free);
  if (!t) return null;

  const tokens = t.split(/[,\s]+/).filter(Boolean);

  // Try exact token hits (from rightmost token)
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tok: string | undefined = tokens[i];
    if (!tok) continue;
    const hit = PLACE_LUT[tok];
    if (hit) return hit;
  }

  // Try substring includes (e.g., "nairobi west")
  for (const key of Object.keys(PLACE_LUT)) {
    if (t.includes(key)) {
      const val = PLACE_LUT[key];
      if (val) return val;
    }
  }
  return null;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371; // km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const c =
    2 *
    Math.asin(Math.sqrt(sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon));
  return Math.round(R * c);
}

/* ======================
   Debounce
   ====================== */
function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = React.useState<T>(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/* ======================
   Page (client)
   ====================== */
export default function HomeClient() {
  const sp = useSearchParams();

  // Derive mode directly from URL (?t=all|products|services) OR legacy ?tab=. We never mutate the URL.
  const mode: Mode = React.useMemo(() => {
    const raw = (sp.get("t") ?? sp.get("tab") ?? "").toLowerCase();
    return raw === "products" || raw === "services" ? (raw as Mode) : "all";
  }, [sp]);

  // URL state (initialize from current query) — NOTE: we never push/replace on mount.
  const [q, setQ] = React.useState(sp.get("q") || "");
  const [category, setCategory] = React.useState(sp.get("category") || "");
  const [subcategory, setSubcategory] = React.useState(sp.get("subcategory") || "");
  const [brand, setBrand] = React.useState(sp.get("brand") || "");
  const [condition, setCondition] = React.useState(sp.get("condition") || "");
  const [minPrice, setMinPrice] = React.useState(sp.get("minPrice") || "");
  const [maxPrice, setMaxPrice] = React.useState(sp.get("maxPrice") || "");
  const [featuredOnly, setFeaturedOnly] = React.useState((sp.get("featured") || "false") === "true");
  const [sort, setSort] = React.useState(sp.get("sort") || "newest");
  const [page, setPage] = React.useState(() => {
    const n = Number(sp.get("page") || 1);
    return Number.isFinite(n) && n > 0 ? n : 1;
  });

  // --------- Geolocation state ---------
  const [myLoc, setMyLoc] = React.useState<{ lat: number; lng: number } | null>(null);
  const [geoDenied, setGeoDenied] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setMyLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoDenied(true),
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 8000 }
    );
  }, []);

  // Keep local state in-sync if URL changes externally (we still never force the URL ourselves).
  React.useEffect(() => {
    const get = (k: string) => sp.get(k) || "";
    if (get("q") !== q) setQ(get("q"));
    if (get("category") !== category) setCategory(get("category"));
    if (get("subcategory") !== subcategory) setSubcategory(get("subcategory"));
    if (get("brand") !== brand) setBrand(get("brand"));
    if (get("condition") !== condition) setCondition(get("condition"));
    if (get("minPrice") !== minPrice) setMinPrice(get("minPrice"));
    if (get("maxPrice") !== maxPrice) setMaxPrice(get("maxPrice"));

    const f = sp.get("featured") === "true";
    if (f !== featuredOnly) setFeaturedOnly(f);

    const s = (sp.get("sort") || "newest") as SortKey;
    if (s !== sort) setSort(toSortKey(s));

    const p = Number(sp.get("page") || 1);
    if (Number.isFinite(p) && p > 0 && p !== page) setPage(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  // When switching away from products, disable product-only fields (brand/condition)
  React.useEffect(() => {
    if (mode !== "products") {
      if (brand) setBrand("");
      if (condition) setCondition("");
    }
  }, [mode, brand, condition]);

  // Debounced inputs (mode derived from URL; include to keep fetches calm)
  const dmode = useDebounced<Mode>(mode, DEBOUNCE_MS);
  const dq = useDebounced(q, DEBOUNCE_MS);
  const dcategory = useDebounced(category, DEBOUNCE_MS);
  const dsubcategory = useDebounced(subcategory, DEBOUNCE_MS);
  const dbrand = useDebounced(brand, DEBOUNCE_MS);
  const dcondition = useDebounced(condition, DEBOUNCE_MS);
  const dminPrice = useDebounced(minPrice, DEBOUNCE_MS);
  const dmaxPrice = useDebounced(maxPrice, DEBOUNCE_MS);
  const dfeaturedOnly = useDebounced(featuredOnly, DEBOUNCE_MS);
  const dsort = useDebounced(sort, DEBOUNCE_MS);
  const dpage = useDebounced(page, DEBOUNCE_MS);

  // Data
  const [res, setRes] = React.useState<PageResponse<AnyItem> | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // Build querystring from (debounced) state — note: *no* `t` here; `t` comes only from URL.
  const queryString = React.useMemo(() => {
    const params = new URLSearchParams();
    if (dq) params.set("q", dq);
    if (dcategory) params.set("category", dcategory);
    if (dsubcategory) params.set("subcategory", dsubcategory);
    if (dbrand && dmode === "products") params.set("brand", dbrand);
    if (dcondition && dmode === "products") params.set("condition", dcondition);
    if (dminPrice) params.set("minPrice", dminPrice);
    if (dmaxPrice) params.set("maxPrice", dmaxPrice);
    if (dfeaturedOnly) params.set("featured", "true");
    if (dsort && dsort !== "newest") params.set("sort", dsort);
    if (dpage && dpage !== 1) params.set("page", String(dpage));
    params.set("pageSize", String(PAGE_SIZE));
    return params.toString();
  }, [
    dq,
    dcategory,
    dsubcategory,
    dbrand,
    dcondition,
    dminPrice,
    dmaxPrice,
    dfeaturedOnly,
    dsort,
    dpage,
    dmode,
  ]);

  // Fetch from unified home-feed with fallback (products/services → all)
  React.useEffect(() => {
    const ac = new AbortController();

    async function load(attempt = 1, fallbackT?: "all" | "products" | "services") {
      if (attempt === 1) {
        setLoading(true);
        setErr(null);
      }
      try {
        const tParam = fallbackT ?? dmode;
        const endpoint = "/api/home-feed";
        const url = `${endpoint}?t=${tParam}${queryString ? `&${queryString}` : ""}`;

        const r = await fetch(url, {
          cache: "no-store",
          signal: ac.signal,
        });

        const json = (await r.json().catch(() => ({}))) as PageResponse<AnyItem> | ErrorResponse;

        if (!r.ok || "error" in json) {
          // Fallback to ALL if specific feed fails
          if ((dmode === "products" || dmode === "services") && !fallbackT && !ac.signal.aborted) {
            return load(attempt, "all");
          }
          const msg = ("error" in json && json.error) || `Request failed (${r.status})`;
          if (attempt < 2 && !ac.signal.aborted) return load(attempt + 1, fallbackT);
          setErr(msg);
          setRes(null);
          return;
        }

        let pageJson = json as PageResponse<AnyItem>;

        // If we fetched ALL as a fallback, client-filter by mode
        if ((dmode === "products" || dmode === "services") && fallbackT === "all") {
          const want = dmode === "products" ? "product" : "service";
          const filtered = (pageJson.items || []).filter((x: AnyItem) => x?.type === want);
          pageJson = {
            ...pageJson,
            items: filtered,
            total: filtered.length,
            totalPages: 1,
            page: 1,
          };
        }

        setRes(pageJson);
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          if (attempt < 2 && !ac.signal.aborted) return load(attempt + 1, fallbackT);
          setErr("Network error. Please try again.");
          setRes(null);
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => ac.abort();
  }, [queryString, dmode]);

  // Pagination derived
  const pageNum = res?.page ?? 1;
  const totalPages = res?.totalPages ?? 1;
  const total = res?.total ?? 0;

  const items = Array.isArray(res?.items) ? (res!.items as AnyItem[]) : [];

  // Small helpers
  const chip = (label: string) => (
    <span className="inline-flex items-center gap-1 rounded-full bg-white border px-3 py-1 text-xs font-medium text-gray-700 shadow-sm">
      {label}
    </span>
  );

  const clearAll = () => {
    setQ("");
    setCategory("");
    setSubcategory("");
    setBrand("");
    setCondition("");
    setMinPrice("");
    setMaxPrice("");
    setFeaturedOnly(false);
    setSort("newest");
    setPage(1);
  };

  // Distance computer (resolved per item) — uses the single geolocation state above.
  const computeDistanceText = React.useCallback(
    (loc: string | null | undefined): { place: string; distanceKm?: number } | null => {
      const resolved = resolveKenyaPlace(loc);
      if (!resolved) return loc ? { place: loc } : null;
      if (!myLoc) return { place: resolved.name };
      const km = haversineKm(myLoc, resolved);
      return { place: resolved.name, distanceKm: km };
    },
    [myLoc]
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Single tabs bar (sticky) */}
      <div className="sticky top-[64px] z-30 card-surface p-2" aria-label="Browse type tabs">
        <HomeTabs />
      </div>

      {/* =======================
          Sticky Filter Bar
          ======================= */}
      <section
        className="card-surface p-4 sticky top=[112px] z-20 backdrop-blur supports-[backdrop-filter]:bg-white/75 dark:supports-[backdrop-filter]:bg-slate-900/70"
        aria-label="Filters"
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          {/* Search */}
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300">
              Search
            </label>
            <input
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder={
                mode === "services"
                  ? "Service, category…"
                  : mode === "products"
                  ? "Name, brand, category…"
                  : "Search products & services…"
              }
              className="mt-1 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#39a0ca]"
              aria-label="Search items"
            />
          </div>

          {/* Category */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300">
              Category
            </label>
            <input
              value={category}
              onChange={(e) => {
                setPage(1);
                setCategory(e.target.value);
              }}
              placeholder="e.g. Electronics"
              className="mt-1 w-full rounded-lg border px-3 py-2"
              aria-label="Category"
            />
          </div>

          {/* Subcategory */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300">
              Subcategory
            </label>
            <input
              value={subcategory}
              onChange={(e) => {
                setPage(1);
                setSubcategory(e.target.value);
              }}
              placeholder={mode === "services" ? "e.g. Plumbing" : "e.g. Phones & Tablets"}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              aria-label="Subcategory"
            />
          </div>

          {/* Brand (products only) */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300">
              Brand {mode !== "products" ? "(n/a)" : ""}
            </label>
            <input
              value={brand}
              onChange={(e) => {
                setPage(1);
                setBrand(e.target.value);
              }}
              placeholder={mode !== "products" ? "—" : "e.g. Samsung"}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              aria-label="Brand"
              disabled={mode !== "products"}
            />
          </div>

          {/* Condition (products only) */}
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300">
              Condition {mode !== "products" ? "(n/a)" : ""}
            </label>
            <select
              value={condition}
              onChange={(e) => {
                setPage(1);
                setCondition(e.target.value);
              }}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              aria-label="Condition"
              disabled={mode !== "products"}
            >
              <option value="">Any</option>
              <option value="brand new">Brand New</option>
              <option value="pre-owned">Pre-Owned</option>
            </select>
          </div>

          {/* Price range */}
          <div className="md:col-span-2 grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300">
                Min (KES)
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={minPrice}
                onChange={(e) => {
                  setPage(1);
                  setMinPrice(e.target.value);
                }}
                className="mt-1 w-full rounded-lg border px-3 py-2"
                aria-label="Minimum price"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300">
                Max (KES)
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={maxPrice}
                onChange={(e) => {
                  setPage(1);
                  setMaxPrice(e.target.value);
                }}
                className="mt-1 w-full rounded-lg border px-3 py-2"
                aria-label="Maximum price"
              />
            </div>
          </div>

          {/* Featured + Sort */}
          <div className="md:col-span-2 flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={featuredOnly}
                onChange={(e) => {
                  setPage(1);
                  setFeaturedOnly(e.target.checked);
                }}
                className="rounded border-gray-300 dark:border-slate-600"
                aria-label="Featured only"
              />
              Featured only
            </label>
            <select
              value={sort}
              onChange={(e) => {
                setPage(1);
                setSort(e.target.value);
              }}
              className="rounded-lg border px-3 py-2"
              title="Sort"
              aria-label="Sort results"
            >
              <option value="newest">Newest</option>
              <option value="featured">Featured first</option>
              <option value="price_asc">Price: Low → High</option>
              <option value="price_desc">Price: High → Low</option>
            </select>
          </div>

          {/* Clear */}
          <div className="md:col-span-12">
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {q && chip(`q: ${q}`)}
              {category && chip(`category: ${category}`)}
              {subcategory && chip(`subcategory: ${subcategory}`)}
              {mode === "products" && brand && chip(`brand: ${brand}`)}
              {mode === "products" && condition && chip(`condition: ${condition}`)}
              {minPrice && chip(`min: ${minPrice}`)}
              {maxPrice && chip(`max: ${maxPrice}`)}
              {featuredOnly && chip("featured only")}
              {(q ||
                category ||
                subcategory ||
                (mode === "products" && brand) ||
                (mode === "products" && condition) ||
                minPrice ||
                maxPrice ||
                featuredOnly) && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition"
                  aria-label="Clear all filters"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </div>

        {loading && (
          <div
            className="mt-3 h-1 w-full bg-gradient-to-r from-[#161748]/20 via-[#478559]/40 to-[#39a0ca]/30 animate-pulse rounded-full"
            aria-hidden
          />
        )}
      </section>

      {/* =======================
          Results / Grid
          ======================= */}
      {loading ? (
        <SkeletonGrid />
      ) : err ? (
        <div className="card-surface p-6 text-red-600">{err}</div>
      ) : (Array.isArray(items) ? items.length : 0) === 0 ? (
        <div className="text-gray-500 dark:text-slate-400">
          No {mode === "all" ? "items" : mode} found.
        </div>
      ) : (
        <section
          id="search-results"
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6"
          aria-label="Search results"
          aria-busy={loading ? "true" : "false"}
        >
          {items.map((it) => {
            const isProduct = it.type === "product";
            const title = it.name || "";
            const imageUrl = it.image || null;
            const price = it.price ?? null;
            const featured = it.featured ?? false;
            const c1 = it.category || "—";
            const c2 = it.subcategory || "—";
            const categoryText = `${c1} • ${c2}`;
            const location = it.location || null;

            const locInfo = computeDistanceText(location);
            const blur = shimmer(800, 440);
            const href = isProduct ? `/product/${it.id}` : `/service/${it.id}`;

            // Accessible label
            const priceText =
              typeof price === "number" && price > 0 ? `KES ${price.toLocaleString()}` : undefined;
            const ariaLabel =
              `${isProduct ? "Product" : "Service"}: ${title}` +
              (priceText ? `, priced at ${priceText}` : "");

            return (
              <Link
                key={`${it.type}-${it.id}`}
                href={href}
                className="relative group"
                aria-label={ariaLabel}
                data-product-id={isProduct ? it.id : undefined}
                data-service-id={!isProduct ? it.id : undefined}
              >
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow hover:shadow-lg transition cursor-pointer overflow-hidden border border-gray-100 dark:border-slate-800">
                  <div className="relative">
                    {featured && (
                      <span className="absolute top-2 left-2 z-10 rounded-md bg-[#161748] text-white text-xs px-2 py-1 shadow">
                        Featured
                      </span>
                    )}
                    <Image
                      alt={title}
                      src={imageUrl || FALLBACK_IMG}
                      width={800}
                      height={440}
                      className="w-full h-44 object-cover bg-gray-100 dark:bg-slate-800"
                      placeholder="blur"
                      blurDataURL={blur}
                      priority={false}
                      unoptimized={Boolean((imageUrl as string | null)?.endsWith?.(".svg"))}
                      onError={makeOnImgError(FALLBACK_IMG)}
                      loading="lazy"
                    />
                    <div className="absolute top-2 right-2 z-10">
                      {isProduct ? <FavoriteButton productId={it.id} /> : null}
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-slate-100 line-clamp-1">
                      {title}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-slate-400 line-clamp-1">
                      {categoryText}
                    </p>
                    {/* Price */}
                    <p className="text-[#161748] dark:text-[#39a0ca] font-bold mt-2">
                      {fmtKES(price)}
                    </p>

                    {/* Location + Distance (Kenya-only) */}
                    {(location || locInfo) && (
                      <p className="mt-1 text-xs text-gray-600 dark:text-slate-300 flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full border px-2 py-0.5">
                          {locInfo?.place || location}
                        </span>
                        {locInfo?.distanceKm !== undefined && (
                          <span className="inline-flex items-center rounded-full border px-2 py-0.5">
                            ~{locInfo.distanceKm} km away
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      )}

      {/* Results footer (pagination for all modes) */}
      <section className="flex items-center justify-between" aria-live="polite">
        <p className="text-sm text-gray-600 dark:text-slate-300">
          {loading
            ? "Loading…"
            : err
            ? "Error loading listings"
            : `${total} items • page ${pageNum} of ${totalPages}`}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!res || res.page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className={`rounded-lg px-3 py-1.5 border ${
              !!res && res.page > 1 && !loading
                ? "hover:bg-gray-50 dark:hover:bg-slate-800"
                : "opacity-50 cursor-not-allowed"
            }`}
            aria-label="Previous page"
          >
            ← Prev
          </button>
          <button
            type="button"
            disabled={!res || res.page >= (res.totalPages || 1) || loading}
            onClick={() => setPage((p) => p + 1)}
            className={`rounded-lg px-3 py-1.5 border ${
              !!res && res.page < (res.totalPages || 1) && !loading
                ? "hover:bg-gray-50 dark:hover:bg-slate-800"
                : "opacity-50 cursor-not-allowed"
            }`}
            aria-label="Next page"
          >
            Next →
          </button>
        </div>
      </section>
    </div>
  );
}

/* ======================
   Skeleton grid (loading)
   ====================== */
function SkeletonGrid() {
  return (
    <section
      className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6"
      aria-hidden
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-gray-100 dark:border-slate-800 shadow-sm"
        >
          <div className="h-44 w-full animate-pulse bg-gray-200 dark:bg-slate-800" />
          <div className="p-4 space-y-2">
            <div className="h-4 w-3/4 bg-gray-200 dark:bg-slate-800 rounded animate-pulse" />
            <div className="h-3 w-1/2 bg-gray-200 dark:bg-slate-800 rounded animate-pulse" />
            <div className="h-4 w-1/3 bg-gray-200 dark:bg-slate-800 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </section>
  );
}
