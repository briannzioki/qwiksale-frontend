// src/app/search/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { InfiniteClient } from "./InfiniteClient";
import type { Sort } from "./SearchClient";

/** Always render fresh – results depend on query string. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SearchParams = Record<string, string | string[] | undefined>;

type Envelope<T> = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: T[];
};

type ProductHit = {
  id: string;
  name: string;
  image?: string | null;
  price?: number | null;
  brand?: string | null;
  condition?: string | null;
  featured?: boolean;
  category: string;
  subcategory: string | null;
};

type ServiceHit = {
  id: string;
  /** Prefer `name`, but support legacy `title`. */
  name?: string | null;
  title?: string | null;
  image?: string | null;
  price?: number | null;
  rateType?: "hour" | "day" | "fixed" | null;
  serviceArea?: string | null;
  availability?: string | null;
  featured?: boolean;
};

function toBool(v: string | undefined) {
  if (!v) return false;
  const s = v.toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}
function toNum(v: string | undefined, fallback?: number) {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function getParam(sp: SearchParams, k: string): string | undefined {
  const v = sp[k];
  return Array.isArray(v) ? v[0] : (v as string | undefined);
}
function siteUrl() {
  const raw =
    process.env["NEXT_PUBLIC_APP_URL"] ||
    (process.env["VERCEL_URL"] ? `https://${process.env["VERCEL_URL"]}` : "");
  return (raw || "").replace(/\/+$/, "");
}

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "featured", label: "Featured first" },
  { value: "price_asc", label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
];

/* ------------------------------ Page ------------------------------ */

export default async function SearchPage({
  searchParams,
}: {
  // Next 15: searchParams is a Promise
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const type = (getParam(sp, "type") || "product") as "product" | "service";
  const q = getParam(sp, "q");
  const category = getParam(sp, "category");
  const subcategory = getParam(sp, "subcategory");
  const brand = getParam(sp, "brand");
  const condition = getParam(sp, "condition");
  const featuredOnly = toBool(getParam(sp, "featured"));
  const minPrice = toNum(getParam(sp, "minPrice"));
  const maxPrice = toNum(getParam(sp, "maxPrice"));
  const page = Math.max(1, toNum(getParam(sp, "page"), 1) || 1);
  const pageSize = Math.min(96, Math.max(1, toNum(getParam(sp, "pageSize"), 24) || 24));
  const sort = ((getParam(sp, "sort") as Sort) || "newest") as Sort;

  // Build querystring for API calls
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (category) qs.set("category", category);
  if (subcategory) qs.set("subcategory", subcategory);
  if (brand) qs.set("brand", brand);
  if (condition) qs.set("condition", condition);
  if (featuredOnly) qs.set("featured", "true");
  if (typeof minPrice === "number") qs.set("minPrice", String(minPrice));
  if (typeof maxPrice === "number") qs.set("maxPrice", String(maxPrice));
  qs.set("page", String(page));
  qs.set("pageSize", String(pageSize));
  qs.set("sort", sort);

  const base = siteUrl();
  const endpoint = type === "product" ? "/api/products" : "/api/services";
  const url = `${base}${endpoint}?${qs.toString()}`;

  // Fetch initial page server-side (SSR fallback)
  const res = await fetch(url, { cache: "no-store" }).catch(() => null);

  const emptyProducts: Envelope<ProductHit> = { page: 1, pageSize, total: 0, totalPages: 1, items: [] };
  const emptyServices: Envelope<ServiceHit> = { page: 1, pageSize, total: 0, totalPages: 1, items: [] };

  const data =
    (await res?.json().catch(() => null)) ||
    (type === "product" ? emptyProducts : emptyServices);

  // If API adjusted page (e.g., asked for page > totalPages), align URL
  if ((data as any).page !== page) {
    const qp = new URLSearchParams();
    Object.entries(sp).forEach(([k, v]) => {
      if (Array.isArray(v)) v.forEach((x) => qp.append(k, String(x)));
      else if (v) qp.set(k, String(v));
    });
    qp.set("page", String((data as any).page));
    redirect(`/search?${qp.toString()}`);
  }

  const headerTitle = type === "product" ? "Search" : "Search Services";

  const clientParams = {
    ...(q ? { q } : {}),
    ...(category ? { category } : {}),
    ...(subcategory ? { subcategory } : {}),
    ...(brand ? { brand } : {}),
    ...(condition ? { condition } : {}),
    ...(featuredOnly ? { featured: true } : {}),
    ...(typeof minPrice === "number" ? { minPrice } : {}),
    ...(typeof maxPrice === "number" ? { maxPrice } : {}),
    sort,
    pageSize,
    type,
  } as const;

  return (
    <div className="container-page py-6">
      {/* Header */}
      <div className="rounded-xl p-5 text-white bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue shadow-soft dark:shadow-none">
        <h1 className="text-2xl md:text-3xl font-extrabold">{headerTitle}</h1>
        <p className="mt-1 text-white/90">
          {q ? (
            <>Results for <span className="font-semibold">“{q}”</span></>
          ) : type === "product" ? (
            "Find deals across categories, brands and services."
          ) : (
            "Find reliable service providers."
          )}
        </p>
      </div>

      {/* Controls */}
      <form
        className="mt-4 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:grid-cols-12"
        method="GET"
        action="/search"
      >
        {/* Type */}
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1">Type</label>
          <select
            name="type"
            defaultValue={type}
            className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brandBlue dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="product">Products</option>
            <option value="service">Services</option>
          </select>
        </div>

        {/* Query */}
        <div className="md:col-span-4">
          <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1">Keywords</label>
          <input
            name="q"
            defaultValue={q || ""}
            placeholder="e.g. Samsung S21, Mama Fua, SUVs…"
            className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brandBlue dark:border-slate-700 dark:bg-slate-950"
          />
        </div>

        {/* Category */}
        <div className="md:col-span-3">
          <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1">Category</label>
          <input
            name="category"
            defaultValue={category || ""}
            placeholder="Any"
            className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brandBlue dark:border-slate-700 dark:bg-slate-950"
          />
        </div>

        {/* Subcategory */}
        <div className="md:col-span-3">
          <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1">Subcategory</label>
          <input
            name="subcategory"
            defaultValue={subcategory || ""}
            placeholder="Any"
            className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brandBlue dark:border-slate-700 dark:bg-slate-950"
          />
        </div>

        {/* Brand */}
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1">Brand</label>
          <input
            name="brand"
            defaultValue={brand || ""}
            placeholder="e.g. Samsung"
            className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brandBlue dark:border-slate-700 dark:bg-slate-950"
          />
        </div>

        {/* Condition */}
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1">Condition</label>
          <select
            name="condition"
            defaultValue={condition || ""}
            className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brandBlue dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="">Any</option>
            <option value="brand new">Brand New</option>
            <option value="pre-owned">Pre-Owned</option>
          </select>
        </div>

        {/* Price */}
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1">Min price (KES)</label>
          <input
            type="number"
            name="minPrice"
            defaultValue={minPrice ?? ""}
            min={0}
            inputMode="numeric"
            className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brandBlue dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1">Max price (KES)</label>
          <input
            type="number"
            name="maxPrice"
            defaultValue={maxPrice ?? ""}
            min={0}
            inputMode="numeric"
            className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brandBlue dark:border-slate-700 dark:bg-slate-950"
          />
        </div>

        {/* Featured + Sort */}
        <div className="md:col-span-2 flex items-end gap-2">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-slate-200">
            <input
              type="checkbox"
              name="featured"
              defaultChecked={featuredOnly}
              className="rounded border-gray-300 dark:border-slate-600"
            />
            Featured only
          </label>
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1">Sort</label>
          <select
            name="sort"
            defaultValue={sort}
            className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brandBlue dark:border-slate-700 dark:bg-slate-950"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Submit */}
        <div className="md:col-span-12 flex items-center gap-2 pt-1">
          <button className="rounded-lg bg-[#161748] px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            Apply filters
          </button>
          <Link className="btn-outline" href="/search" prefetch={false} aria-label="Clear filters">
            Clear
          </Link>
        </div>
      </form>

      {/* Meta */}
      <div className="mt-3 text-sm text-gray-600 dark:text-slate-300">
        Showing <strong>{(data as any).items.length}</strong> of <strong>{(data as any).total}</strong>{" "}
        results {(data as any).total > 0 && `(page ${(data as any).page} / ${(data as any).totalPages})`}
      </div>

      {/* Results grid (SSR page 1) – anchors with accessible names matching Home */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {type === "product"
          ? (data as Envelope<ProductHit>).items.map((p) => {
              const href = `/product/${p.id}`;
              const priceNum = typeof p.price === "number" && p.price > 0 ? p.price : undefined;
              const priceStr = priceNum !== undefined ? priceNum.toLocaleString() : undefined;
              const aria =
                priceStr !== undefined
                  ? `Product: ${p.name} — priced at KSh ${priceStr}`
                  : `Product: ${p.name}`;

              return (
                <Link
                  key={p.id}
                  href={href}
                  aria-label={aria}
                  className="group block overflow-hidden rounded-xl border bg-white shadow-sm hover:shadow-md focus:outline-none focus:ring dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="aspect-[4/3] w-full bg-gray-100 dark:bg-slate-800">
                    <div
                      className="h-full w-full"
                      style={{
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        backgroundImage: p.image ? `url(${p.image})` : "none",
                      }}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="p-3">
                    <div className="line-clamp-1 text-sm font-medium">{p.name}</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-gray-600 dark:text-slate-400">
                      <span className="line-clamp-1">
                        {p.category || p.subcategory || "—"}
                      </span>
                      <span>{priceStr !== undefined ? `KSh ${priceStr}` : "—"}</span>
                    </div>
                  </div>
                </Link>
              );
            })
          : (data as Envelope<ServiceHit>).items.map((s) => {
              const name = s.name ?? s.title ?? "Service";
              const href = `/service/${s.id}`;
              const priceNum = typeof s.price === "number" && s.price > 0 ? s.price : undefined;
              const priceStr = priceNum !== undefined ? priceNum.toLocaleString() : undefined;
              const aria = `Service: ${name}`;

              return (
                <Link
                  key={s.id}
                  href={href}
                  aria-label={aria}
                  className="group block overflow-hidden rounded-xl border bg-white shadow-sm hover:shadow-md focus:outline-none focus:ring dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="aspect-[4/3] w-full bg-gray-100 dark:bg-slate-800">
                    <div
                      className="h-full w-full"
                      style={{
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        backgroundImage: s.image ? `url(${s.image})` : "none",
                      }}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="p-3">
                    <div className="line-clamp-1 text-sm font-medium">{name}</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-gray-600 dark:text-slate-400">
                      <span className="line-clamp-1">
                        {s.serviceArea || s.availability || "—"}
                      </span>
                      <span>{priceStr !== undefined ? `KSh ${priceStr}` : "—"}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
      </div>

      {/* Empty state */}
      {(data as any).total === 0 && (
        <div className="mt-8 rounded-xl border bg-white p-6 text-center text-gray-700 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
          <p className="text-lg font-semibold">No results</p>
          <p className="mt-1 text-sm">
            {type === "product"
              ? "Try different keywords or remove some filters."
              : "Try different keywords or broaden your filters."}
          </p>
          <div className="mt-3">
            <Link href="/search" className="btn-outline">
              Reset search
            </Link>
          </div>
        </div>
      )}

      {/* Infinite client loader – progressively loads page 2+ */}
      {(data as any).totalPages > 1 && (
        <div className="mt-6">
          <InfiniteClient
            endpoint={endpoint}
            initial={data as any}
            params={clientParams}
          />
        </div>
      )}
    </div>
  );
}
