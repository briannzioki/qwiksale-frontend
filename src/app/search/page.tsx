// src/app/search/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Sort } from "./SearchClient";
import { InfiniteClient } from "./InfiniteClient";
import { getBaseUrl } from "@/app/lib/url";
import SectionHeader from "@/app/components/SectionHeader";
import NumberInputNoWheel from "@/app/components/ui/NumberInputNoWheel";

// Fallback cards are regular client components—import them statically
import ProductCard from "@/app/components/ProductCard";
import ServiceCard from "@/app/components/ServiceCard";

// Always render fresh – results depend on query string.
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

/* --------------------------- tiny utils --------------------------- */

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

  // ⚙️ Keep UI pageSize aligned with API cap (1..48)
  const pageSize = Math.min(48, Math.max(1, toNum(getParam(sp, "pageSize"), 24) || 24));

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

  const base = getBaseUrl();

  // Endpoints consistent with HomeClient and your API
  const endpoint = type === "product" ? "/api/products" : "/api/services";
  const url = `${base}${endpoint}?${qs.toString()}`;

  // Fetch initial page server-side (SSR fallback)
  let initialError: string | null = null;
  const res = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!res) {
    initialError = "Network error while loading results.";
  } else if (!res.ok) {
    initialError = `Search failed (${res.status}).`;
  }

  const json = res && res.ok ? await res.json().catch(() => null) : null;

  const emptyProducts: Envelope<ProductHit> = { page: 1, pageSize, total: 0, totalPages: 1, items: [] };
  const emptyServices: Envelope<ServiceHit> = { page: 1, pageSize, total: 0, totalPages: 1, items: [] };

  const data =
    json ||
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

  // Prefer new ListingCard if available (optional dependency)
  let ListingCard: any = null;
  let hasListingCard = true;
  try {
    ListingCard = (await import("@/app/components/ListingCard")).default as any;
  } catch {
    hasListingCard = false;
  }

  // Open the <details> block if any advanced filter is present
  const advancedOpen =
    Boolean(brand) ||
    Boolean(condition) ||
    typeof minPrice === "number" ||
    typeof maxPrice === "number";

  return (
    <div className="container-page py-6">
      {/* Section header (brand gradient, matches the shared style) */}
      <SectionHeader
        title={headerTitle}
        subtitle={
          q
            ? `Results for “${q}”`
            : type === "product"
              ? "Find deals across categories, brands and conditions."
              : "Find reliable service providers."
        }
        actions={
          <Link
            href="/"
            prefetch={false}
            className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/25"
          >
            Home
          </Link>
        }
      />

      {/* Filters card */}
      <form
        className="mt-4 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        method="GET"
        action="/search"
      >
        {/* Row 1: Type + Keywords + Category + Subcategory (Type floats right on md+) */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          {/* Keywords */}
          <div className="md:col-span-6">
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300">
              Keywords
            </label>
            <input
              name="q"
              defaultValue={q || ""}
              placeholder="e.g. Samsung S21, Mama Fua, SUVs…"
              className="
                mt-1 w-full rounded-lg px-3 py-2
                bg-white dark:bg-slate-800
                border border-gray-200 dark:border-slate-700
                text-gray-900 dark:text-slate-100
                focus:outline-none focus:ring-2 focus:ring-[#39a0ca]
              "
            />
          </div>

          {/* Category */}
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300">
              Category
            </label>
            <input
              name="category"
              defaultValue={category || ""}
              placeholder="Any"
              className="
                mt-1 w-full rounded-lg px-3 py-2
                bg-white dark:bg-slate-800
                border border-gray-200 dark:border-slate-700
                text-gray-900 dark:text-slate-100
                focus:outline-none focus:ring-2 focus:ring-[#39a0ca]
              "
            />
          </div>

          {/* Subcategory */}
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300">
              Subcategory
            </label>
            <input
              name="subcategory"
              defaultValue={subcategory || ""}
              placeholder="Any"
              className="
                mt-1 w-full rounded-lg px-3 py-2
                bg-white dark:bg-slate-800
                border border-gray-200 dark:border-slate-700
                text-gray-900 dark:text-slate-100
                focus:outline-none focus:ring-2 focus:ring-[#39a0ca]
              "
            />
          </div>
        </div>

        {/* Progressive disclosure: advanced filters */}
        <details className="rounded-lg border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-3" {...(advancedOpen ? { open: true } : {})}>
          <summary className="cursor-pointer select-none text-sm font-medium text-gray-700 dark:text-slate-200">
            More filters
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-12">
            {/* Brand */}
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300">
                Brand
              </label>
              <input
                name="brand"
                defaultValue={brand || ""}
                placeholder="e.g. Samsung"
                className="
                  mt-1 w-full rounded-lg px-3 py-2
                  bg-white dark:bg-slate-800
                  border border-gray-200 dark:border-slate-700
                  text-gray-900 dark:text-slate-100
                  focus:outline-none focus:ring-2 focus:ring-[#39a0ca]
                "
              />
            </div>

            {/* Condition */}
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300">
                Condition
              </label>
              <select
                name="condition"
                defaultValue={condition || ""}
                className="
                  mt-1 w-full rounded-lg px-3 py-2
                  bg-white dark:bg-slate-800
                  border border-gray-200 dark:border-slate-700
                  text-gray-900 dark:text-slate-100
                  focus:outline-none focus:ring-2 focus:ring-[#39a0ca]
                "
              >
                <option value="">Any</option>
                <option value="brand new">Brand New</option>
                <option value="pre-owned">Pre-Owned</option>
              </select>
            </div>

            {/* Min / Max */}
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300">
                Min price (KES)
              </label>
              <NumberInputNoWheel
                name="minPrice"
                defaultValue={minPrice ?? ""}
                min={0}
                inputMode="numeric"
                className="
                  mt-1 w-full rounded-lg px-3 py-2
                  bg-white dark:bg-slate-800
                  border border-gray-200 dark:border-slate-700
                  text-gray-900 dark:text-slate-100
                  focus:outline-none focus:ring-2 focus:ring-[#39a0ca]
                "
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300">
                Max price (KES)
              </label>
              <NumberInputNoWheel
                name="maxPrice"
                defaultValue={maxPrice ?? ""}
                min={0}
                inputMode="numeric"
                className="
                  mt-1 w-full rounded-lg px-3 py-2
                  bg-white dark:bg-slate-800
                  border border-gray-200 dark:border-slate-700
                  text-gray-900 dark:text-slate-100
                  focus:outline-none focus:ring-2 focus:ring-[#39a0ca]
                "
              />
            </div>
          </div>
        </details>

        {/* Row: Type / Featured / Sort */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          {/* Type */}
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300">
              Type
            </label>
            <select
              name="type"
              defaultValue={type}
              className="
                mt-1 w-full rounded-lg px-3 py-2
                bg-white dark:bg-slate-800
                border border-gray-200 dark:border-slate-700
                text-gray-900 dark:text-slate-100
                focus:outline-none focus:ring-2 focus:ring-[#39a0ca]
              "
            >
              <option value="product">Products</option>
              <option value="service">Services</option>
            </select>
          </div>

          {/* Featured */}
          <div className="md:col-span-3 flex items-end">
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

          {/* Sort */}
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300">
              Sort
            </label>
            <select
              name="sort"
              defaultValue={sort}
              className="
                mt-1 w-full rounded-lg px-3 py-2
                bg-white dark:bg-slate-800
                border border-gray-200 dark:border-slate-700
                text-gray-900 dark:text-slate-100
                focus:outline-none focus:ring-2 focus:ring-[#39a0ca]
              "
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-2 pt-1">
          {/* When changing filters, go back to page 1 */}
          <input type="hidden" name="page" value="1" />
          <input type="hidden" name="pageSize" value={String(pageSize)} />
          <button className="btn-gradient-primary">Apply filters</button>
          <Link className="btn-outline" href="/search" prefetch={false} aria-label="Clear filters">
            Clear
          </Link>
        </div>
      </form>

      {/* SSR fetch error banner (retriable) */}
      {initialError && (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">We couldn’t load results. {initialError}</p>
            <div className="flex items-center gap-2">
              <Link
                href={`/search?${qs.toString()}`}
                prefetch={false}
                className="rounded-lg border border-red-300 bg-white/70 px-2.5 py-1.5 text-xs font-semibold text-red-800 hover:bg-white dark:border-rose-800/60 dark:bg-transparent dark:text-rose-200 dark:hover:bg-rose-900/30"
              >
                Try again
              </Link>
              <Link
                href="/"
                prefetch={false}
                className="rounded-lg border border-gray-300 bg-white/70 px-2.5 py-1.5 text-xs font-semibold text-gray-800 hover:bg-white dark:border-white/20 dark:bg-transparent dark:text-slate-100 dark:hover:bg-white/10"
              >
                Go Home
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Meta */}
      <div className="mt-3 text-sm text-gray-600 dark:text-slate-300">
        Showing <strong>{(data as any).items.length}</strong> of <strong>{(data as any).total}</strong>{" "}
        results {(data as any).total > 0 && `(page ${(data as any).page} / ${(data as any).totalPages})`}
      </div>

      {/* Results grid (SSR page 1) */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {hasListingCard
          ? (type === "product"
              ? (data as Envelope<ProductHit>).items.map((p) => (
                  <ListingCard
                    key={p.id}
                    href={`/product/${p.id}`}
                    title={p.name}
                    imageUrl={p.image ?? null}
                    price={p.price ?? null}
                    featured={p.featured ?? false}
                    metaTop={p.brand || undefined}
                    metaBottom={p.condition || undefined}
                  />
                ))
              : (data as Envelope<ServiceHit>).items.map((s) => (
                  <ListingCard
                    key={s.id}
                    href={`/service/${s.id}`}
                    title={s.name ?? s.title ?? "Service"}
                    imageUrl={s.image ?? null}
                    price={s.price ?? null}
                    featured={s.featured ?? false}
                    metaTop={s.serviceArea || undefined}
                    metaBottom={s.rateType ? `/${s.rateType}` : s.availability || undefined}
                  />
                )))
          : type === "product"
            ? (data as Envelope<ProductHit>).items.map((p) => (
                <ProductCard
                  key={p.id}
                  {...({
                    id: p.id,
                    name: p.name,
                    image: p.image ?? null,
                    price: p.price === 0 ? null : p.price ?? null,
                    ...(typeof p.featured === "boolean" ? { featured: p.featured } : {}),
                  } as any)}
                />
              ))
            : (data as Envelope<ServiceHit>).items.map((s) => (
                <ServiceCard
                  key={s.id}
                  id={s.id}
                  name={s.name ?? s.title ?? "Service"}
                  image={s.image ?? null}
                  price={s.price ?? null}
                  {...(s.rateType ? { rateType: s.rateType } : {})}
                  {...(s.serviceArea != null ? { serviceArea: s.serviceArea } : {})}
                  {...(s.availability != null ? { availability: s.availability } : {})}
                  {...(typeof s.featured === "boolean" ? { featured: s.featured } : {})}
                />
              ))}
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
          <InfiniteClient endpoint={endpoint} initial={data as any} params={clientParams} />
        </div>
      )}
    </div>
  );
}
