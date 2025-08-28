"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import FavoriteButton from "./components/FavoriteButton";

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

const fmtKES = (n?: number | null) =>
  typeof n === "number" && n > 0 ? `KES ${n.toLocaleString()}` : "Contact for price";

function useDebounced<T>(value: T, delay = DEBOUNCE_MS) {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/* ======================
   Page
   ====================== */
export default function HomePage() {
  const router = useRouter();
  const sp = useSearchParams();

  // URL state
  const [q, setQ] = useState(sp.get("q") || "");
  const [category, setCategory] = useState(sp.get("category") || "");
  const [subcategory, setSubcategory] = useState(sp.get("subcategory") || "");
  const [brand, setBrand] = useState(sp.get("brand") || "");
  const [condition, setCondition] = useState(sp.get("condition") || "");
  const [minPrice, setMinPrice] = useState(sp.get("minPrice") || "");
  const [maxPrice, setMaxPrice] = useState(sp.get("maxPrice") || "");
  const [verifiedOnly, setVerifiedOnly] = useState((sp.get("verifiedOnly") || "false") === "true");
  const [sort, setSort] = useState(sp.get("sort") || "top");
  const [page, setPage] = useState(Number(sp.get("page") || 1));

  // Debounced inputs
  const dq = useDebounced(q);
  const dcategory = useDebounced(category);
  const dsubcategory = useDebounced(subcategory);
  const dbrand = useDebounced(brand);
  const dcondition = useDebounced(condition);
  const dminPrice = useDebounced(minPrice);
  const dmaxPrice = useDebounced(maxPrice);
  const dverifiedOnly = useDebounced(verifiedOnly);
  const dsort = useDebounced(sort);
  const dpage = useDebounced(page);

  // Data
  const [res, setRes] = useState<PageResponse | null>(null);
  const [facets, setFacets] = useState<Facets | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Only compute facets on page 1 (faster)
  const includeFacets = dpage === 1;

  // Build querystring from (debounced) state
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (dq) params.set("q", dq);
    if (dcategory) params.set("category", dcategory);
    if (dsubcategory) params.set("subcategory", dsubcategory);
    if (dbrand) params.set("brand", dbrand);
    if (dcondition) params.set("condition", dcondition);
    if (dminPrice) params.set("minPrice", dminPrice);
    if (dmaxPrice) params.set("maxPrice", dmaxPrice);
    if (dverifiedOnly) params.set("verifiedOnly", "true");
    if (dsort && dsort !== "top") params.set("sort", dsort);
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
    dverifiedOnly,
    dsort,
    dpage,
    includeFacets,
  ]);

  // Keep URL in sync (shallow)
  const lastUrlRef = useRef<string>("");
  useEffect(() => {
    const next = `/?${queryString}`;
    if (next !== lastUrlRef.current) {
      lastUrlRef.current = next;
      router.replace(next as any);
    }
  }, [router, queryString]);

  // Fetch products (with abort + small retry)
  useEffect(() => {
    const ac = new AbortController();

    async function load(attempt = 1) {
      setLoading(true);
      setErr(null);
      setRes(null);
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
        }
      } finally {
        setLoading(false);
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
  const applyFacet = useCallback(
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
    setVerifiedOnly(false);
    setSort("top");
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* =======================
          Sticky Filter Bar
          ======================= */}
      <section className="card-surface p-4 sticky top-[64px] z-20 backdrop-blur supports-[backdrop-filter]:bg-white/75 dark:supports-[backdrop-filter]:bg-slate-900/70">
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
              />
            </div>
          </div>

          {/* Verified + Sort */}
          <div className="md:col-span-2 flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(e) => {
                  setPage(1);
                  setVerifiedOnly(e.target.checked);
                }}
                className="rounded border-gray-300 dark:border-slate-600"
              />
              Verified only
            </label>
            <select
              value={sort}
              onChange={(e) => {
                setPage(1);
                setSort(e.target.value);
              }}
              className="rounded-lg border px-3 py-2"
              title="Sort"
            >
              <option value="top">Top</option>
              <option value="new">Newest</option>
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
              {verifiedOnly && chip("verified only")}
              {(q ||
                category ||
                subcategory ||
                brand ||
                condition ||
                minPrice ||
                maxPrice ||
                verifiedOnly) && (
                <button
                  onClick={clearAll}
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* subtle loading shimmer under the bar */}
        {loading && (
          <div className="mt-3 h-1 w-full bg-gradient-to-r from-[#161748]/20 via-[#478559]/40 to-[#39a0ca]/30 animate-pulse rounded-full" />
        )}
      </section>

      {/* =======================
          Facets (when present)
          ======================= */}
      {facets &&
      (facets.categories?.length || facets.brands?.length || facets.conditions?.length) ? (
        <section className="card-surface p-4">
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
      <section className="flex items-center justify-between">
        <p className="text-sm text-gray-600 dark:text-slate-300">
          {loading
            ? "Loading…"
            : err
            ? "Error loading listings"
            : `${total} items • page ${pageNum} of ${totalPages}`}
        </p>
        <div className="flex items-center gap-2">
          <button
            disabled={!canPrev || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className={`rounded-lg px-3 py-1.5 border ${
              canPrev && !loading ? "hover:bg-gray-50 dark:hover:bg-slate-800" : "opacity-50 cursor-not-allowed"
            }`}
          >
            ← Prev
          </button>
          <button
            disabled={!canNext || loading}
            onClick={() => setPage((p) => p + 1)}
            className={`rounded-lg px-3 py-1.5 border ${
              canNext && !loading ? "hover:bg-gray-50 dark:hover:bg-slate-800" : "opacity-50 cursor-not-allowed"
            }`}
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
        <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {items.map((p) => (
            <Link key={p.id} href={`/product/${p.id}`} className="relative group">
              <div className="bg-white dark:bg-slate-900 rounded-xl shadow hover:shadow-lg transition cursor-pointer overflow-hidden border border-gray-100 dark:border-slate-800">
                <div className="relative">
                  {p.featured && (
                    <span className="absolute top-2 left-2 z-10 rounded-md bg-[#161748] text-white text-xs px-2 py-1 shadow">
                      Verified
                    </span>
                  )}
                  <Image
                    alt={p.name}
                    src={p.image || "/placeholder/default.jpg"}
                    width={800}
                    height={440}
                    className="w-full h-44 object-cover bg-gray-100 dark:bg-slate-800"
                    priority={false}
                    unoptimized={p.image?.endsWith(".svg") || undefined}
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
                  <p className="text-[#161748] dark:text-[#39a0ca] font-bold mt-2">{fmtKES(p.price)}</p>
                </div>
              </div>
            </Link>
          ))}
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
    <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
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
