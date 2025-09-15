"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import FavoriteButton from "../components/FavoriteButton";
import HomeClientHero from "../components/HomeClientHero";

/* ======================
   Types
   ====================== */
type ApiItem = {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  brand?: string | null;
  condition?: string | null;
  price?: number | null;
  image?: string | null;
  featured?: boolean;
  location?: string | null;
};

type FacetEntry = { value: string; count: number };
type Facets = {
  categories?: FacetEntry[];
  brands?: FacetEntry[];
  conditions?: FacetEntry[];
};

type PageResponse = {
  mode?: "page";
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: ApiItem[];
  facets?: Facets;
};

type ErrorResponse = { error: string };

/* ======================
   Constants & helpers
   ====================== */
const PAGE_SIZE = 24;
const DEBOUNCE_MS = 300;
const FALLBACK_IMG = "/placeholder/default.jpg";

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
  // Guard: ensure we have a base64 encoder in all runtimes
  const encode =
    typeof window === "undefined"
      ? (str: string) => Buffer.from(str).toString("base64")
      : (str: string) => (globalThis.btoa ? globalThis.btoa(str) : Buffer.from(str).toString("base64"));
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
    (p.aliases || []).forEach((a) => (lut[a.toLowerCase()] = { name: p.name, lat: p.lat, lng: p.lng }));
  }
  return lut;
})();

function normPlaceString(s: string) {
  // keep only letters, numbers, comma & space; collapse spaces
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
    2 * Math.asin(Math.sqrt(sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon));
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
  const router = useRouter();
  const sp = useSearchParams();

  // URL state (initialize from current query)
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

  // Debounced inputs
  const dq = useDebounced(q);
  const dcategory = useDebounced(category);
  const dsubcategory = useDebounced(subcategory);
  const dbrand = useDebounced(brand);
  const dcondition = useDebounced(condition);
  const dminPrice = useDebounced(minPrice);
  const dmaxPrice = useDebounced(maxPrice);
  const dfeaturedOnly = useDebounced(featuredOnly);
  const dsort = useDebounced(sort);
  const dpage = useDebounced(page);

  // Data
  const [res, setRes] = React.useState<PageResponse | null>(null);
  const [facets, setFacets] = React.useState<Facets | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // Buyer geolocation (optional)
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

  // Only compute facets on page 1 (faster)
  const includeFacets = dpage === 1;

  // Build querystring from (debounced) state
  const queryString = React.useMemo(() => {
    const params = new URLSearchParams();
    if (dq) params.set("q", dq);
    if (dcategory) params.set("category", dcategory);
    if (dsubcategory) params.set("subcategory", dsubcategory);
    if (dbrand) params.set("brand", dbrand);
    if (dcondition) params.set("condition", dcondition);
    if (dminPrice) params.set("minPrice", dminPrice);
    if (dmaxPrice) params.set("maxPrice", dmaxPrice);
    if (dfeaturedOnly) params.set("featured", "true");
    if (dsort && dsort !== "newest") params.set("sort", dsort);
    if (dpage && dpage !== 1) params.set("page", String(dpage));
    params.set("pageSize", String(PAGE_SIZE));
    if (includeFacets) params.set("facets", "true");
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
    includeFacets,
  ]);

  // Keep URL in sync (shallow) without spamming history
  const lastUrlRef = React.useRef<string>("");
  React.useEffect(() => {
    const next = queryString ? `/?${queryString}` : "/";
    if (next !== lastUrlRef.current) {
      lastUrlRef.current = next;
      router.replace(next);
    }
  }, [router, queryString]);

  // Fetch products (with abort + small retry)
  React.useEffect(() => {
    const ac = new AbortController();

    async function load(attempt = 1) {
      if (attempt === 1) {
        setLoading(true);
        setErr(null);
      }
      try {
        const r = await fetch(`/api/products?${queryString}`, {
          cache: "no-store",
          signal: ac.signal,
        });
        const json = (await r.json()) as PageResponse | ErrorResponse;
        if (!r.ok || "error" in json) {
          const msg = ("error" in json && json.error) || `Request failed (${r.status})`;
          if (attempt < 2 && !ac.signal.aborted) return load(attempt + 1);
          setErr(msg);
          setRes(null);
          setFacets(undefined);
          return;
        }
        const pageJson = json as PageResponse;
        setRes(pageJson);
        setFacets(pageJson.facets);
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          if (attempt < 2 && !ac.signal.aborted) return load(attempt + 1);
          setErr("Network error. Please try again.");
          setRes(null);
          setFacets(undefined);
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => ac.abort();
  }, [queryString]);

  // Pagination derived
  const pageNum = res?.page ?? 1;
  const totalPages = res?.totalPages ?? 1;
  const total = res?.total ?? 0;
  const canPrev = pageNum > 1;
  const canNext = pageNum < totalPages;

  const items: ApiItem[] = Array.isArray(res?.items) ? res!.items : [];

  // Facet clicks
  const applyFacet = React.useCallback(
    (type: "category" | "brand" | "condition", value: string) => {
      setPage(1);
      if (type === "category") setCategory(value);
      if (type === "brand") setBrand(value);
      if (type === "condition") setCondition(value);
    },
    []
  );

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

  // Distance computer (resolved per item)
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
      {/* Authenticated hero */}
      <HomeClientHero />

      {/* =======================
          Sticky Filter Bar
          ======================= */}
      <section
        className="card-surface p-4 sticky top-[64px] z-20 backdrop-blur supports-[backdrop-filter]:bg-white/75 dark:supports-[backdrop-filter]:bg-slate-900/70"
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
              placeholder="Name, brand, category…"
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
              placeholder="e.g. Phones & Tablets"
              className="mt-1 w-full rounded-lg border px-3 py-2"
              aria-label="Subcategory"
            />
          </div>

          {/* Brand */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300">
              Brand
            </label>
            <input
              value={brand}
              onChange={(e) => {
                setPage(1);
                setBrand(e.target.value);
              }}
              placeholder="e.g. Samsung"
              className="mt-1 w-full rounded-lg border px-3 py-2"
              aria-label="Brand"
            />
          </div>

          {/* Condition */}
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300">
              Condition
            </label>
            <select
              value={condition}
              onChange={(e) => {
                setPage(1);
                setCondition(e.target.value);
              }}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              aria-label="Condition"
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
              {brand && chip(`brand: ${brand}`)}
              {condition && chip(`condition: ${condition}`)}
              {minPrice && chip(`min: ${minPrice}`)}
              {maxPrice && chip(`max: ${maxPrice}`)}
              {featuredOnly && chip("featured only")}
              {(q ||
                category ||
                subcategory ||
                brand ||
                condition ||
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

        {/* subtle loading shimmer under the bar */}
        {loading && (
          <div
            className="mt-3 h-1 w-full bg-gradient-to-r from-[#161748]/20 via-[#478559]/40 to-[#39a0ca]/30 animate-pulse rounded-full"
            aria-hidden
          />
        )}
      </section>

      {/* =======================
          Facets (when present)
          ======================= */}
      {facets &&
      (facets.categories?.length || facets.brands?.length || facets.conditions?.length) ? (
        <section className="card-surface p-4" aria-label="Facets">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Categories */}
            <div>
              <div className="text-sm font-semibold mb-2">Top Categories</div>
              <div className="flex flex-wrap gap-2">
                {(facets.categories || []).map((f) => (
                  <button
                    key={`cat-${f.value}`}
                    onClick={() => applyFacet("category", f.value)}
                    className="rounded-full border px-3 py-1 text-xs hover:bg-gray-50 dark:hover:bg-slate-800 transition"
                    title={`${f.count} items`}
                    aria-label={`Filter by category ${f.value}`}
                  >
                    {f.value} <span className="opacity-60">({f.count})</span>
                  </button>
                ))}
              </div>
            </div>
            {/* Brands */}
            <div>
              <div className="text-sm font-semibold mb-2">Top Brands</div>
              <div className="flex flex-wrap gap-2">
                {(facets.brands || []).map((f) => (
                  <button
                    key={`brand-${f.value}`}
                    onClick={() => applyFacet("brand", f.value)}
                    className="rounded-full border px-3 py-1 text-xs hover:bg-gray-50 dark:hover:bg-slate-800 transition"
                    title={`${f.count} items`}
                    aria-label={`Filter by brand ${f.value}`}
                  >
                    {f.value} <span className="opacity-60">({f.count})</span>
                  </button>
                ))}
              </div>
            </div>
            {/* Conditions */}
            <div>
              <div className="text-sm font-semibold mb-2">Condition</div>
              <div className="flex flex-wrap gap-2">
                {(facets.conditions || []).map((f) => (
                  <button
                    key={`cond-${f.value}`}
                    onClick={() => applyFacet("condition", f.value)}
                    className="rounded-full border px-3 py-1 text-xs hover:bg-gray-50 dark:hover:bg-slate-800 transition"
                    title={`${f.count} items`}
                    aria-label={`Filter by condition ${f.value}`}
                  >
                    {f.value} <span className="opacity-60">({f.count})</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* =======================
          Results header
          ======================= */}
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
            disabled={!canPrev || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className={`rounded-lg px-3 py-1.5 border ${
              canPrev && !loading ? "hover:bg-gray-50 dark:hover:bg-slate-800" : "opacity-50 cursor-not-allowed"
            }`}
            aria-label="Previous page"
          >
            ← Prev
          </button>
          <button
            type="button"
            disabled={!canNext || loading}
            onClick={() => setPage((p) => p + 1)}
            className={`rounded-lg px-3 py-1.5 border ${
              canNext && !loading ? "hover:bg-gray-50 dark:hover:bg-slate-800" : "opacity-50 cursor-not-allowed"
            }`}
            aria-label="Next page"
          >
            Next →
          </button>
        </div>
      </section>

      {/* =======================
          Grid
          ======================= */}
      {loading ? (
        <SkeletonGrid />
      ) : err ? (
        <div className="card-surface p-6 text-red-600">{err}</div>
      ) : items.length === 0 ? (
        <div className="text-gray-500 dark:text-slate-400">No items found.</div>
      ) : (
        <section
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6"
          aria-label="Search results"
        >
          {items.map((p) => {
            const locInfo = computeDistanceText(p.location);
            const blur = shimmer(800, 440);
            return (
              <Link key={p.id} href={`/product/${p.id}`} className="relative group">
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow hover:shadow-lg transition cursor-pointer overflow-hidden border border-gray-100 dark:border-slate-800">
                  <div className="relative">
                    {p.featured && (
                      <span className="absolute top-2 left-2 z-10 rounded-md bg-[#161748] text-white text-xs px-2 py-1 shadow">
                        Featured
                      </span>
                    )}
                    <Image
                      alt={p.name}
                      src={p.image || FALLBACK_IMG}
                      width={800}
                      height={440}
                      className="w-full h-44 object-cover bg-gray-100 dark:bg-slate-800"
                      placeholder="blur"
                      blurDataURL={blur}
                      priority={false}
                      // Avoid optimizing SVGs (next/image limitation)
                      unoptimized={Boolean(p.image?.endsWith?.(".svg"))}
                      onError={makeOnImgError(FALLBACK_IMG)}
                      loading="lazy"
                    />
                    <div className="absolute top-2 right-2 z-10">
                      <FavoriteButton productId={p.id} />
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-slate-100 line-clamp-1">
                      {p.name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-slate-400 line-clamp-1">
                      {p.category} • {p.subcategory}
                    </p>
                    {p.brand && (
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                        Brand: {p.brand}
                      </p>
                    )}

                    {/* Price */}
                    <p className="text-[#161748] dark:text-[#39a0ca] font-bold mt-2">{fmtKES(p.price)}</p>

                    {/* Location + Distance (Kenya-only) */}
                    {(p.location || locInfo) && (
                      <p className="mt-1 text-xs text-gray-600 dark:text-slate-300 flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full border px-2 py-0.5">
                          {locInfo?.place || p.location}
                        </span>
                        {locInfo?.distanceKm !== undefined && (
                          <span className="inline-flex items-center rounded-full border px-2 py-0.5">
                            ~{locInfo.distanceKm} km away
                          </span>
                        )}
                        {geoDenied && (
                          <span className="text-[11px] opacity-60">(enable location for distance)</span>
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
    </div>
  );
}

/* ======================
   Skeleton grid (loading)
   ====================== */
function SkeletonGrid() {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6" aria-hidden>
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
