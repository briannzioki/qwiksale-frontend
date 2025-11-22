import type { ReactNode } from "react";
import Link from "next/link";
import SectionHeader from "@/app/components/SectionHeader";
import NumberInputNoWheel from "@/app/components/ui/NumberInputNoWheel";
import type { SearchParams15 } from "@/app/lib/next15";
import type { Sort } from "./SearchClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SearchResultItem = {
  kind: "product" | "service";
  id: string;
  name: string;
  href: string;
};

type Envelope<T> = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: T[];
};

/* ------------------------ helpers ------------------------ */

function toBool(v: string | undefined) {
  if (!v) return false;
  const s = v.toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function toNum(v: string | undefined, fallback?: number) {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function getParam(sp: SearchParams15, k: string): string | undefined {
  const v = sp[k];
  return Array.isArray(v) ? (v[0] as string | undefined) : (v as string | undefined);
}

function keepQuery(
  base: string,
  sp: SearchParams15,
  overrides: Partial<
    Record<
      | "type"
      | "q"
      | "category"
      | "subcategory"
      | "brand"
      | "condition"
      | "featured"
      | "minPrice"
      | "maxPrice"
      | "sort"
      | "page"
      | "pageSize",
      string | null | undefined
    >
  >,
  { dropPageOnChange = true }: { dropPageOnChange?: boolean } = {},
) {
  const url = new URL(base, "http://x");
  const qp = url.searchParams;

  // start from current searchParams
  Object.entries(sp).forEach(([k, v]) => {
    if (Array.isArray(v)) {
      qp.delete(k);
      v.forEach((x) => qp.append(k, String(x)));
    } else if (v != null) {
      qp.set(k, String(v));
    }
  });

  // apply overrides
  Object.entries(overrides).forEach(([k, v]) => {
    if (v == null || v === "") qp.delete(k);
    else qp.set(k, v);
  });

  if (dropPageOnChange) {
    qp.delete("page");
  }

  const qs = qp.toString();
  return qs ? `${base}?${qs}` : base;
}

function makeApiUrl(path: string) {
  const envBase =
    process.env["NEXT_PUBLIC_SITE_URL"] ||
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["VERCEL_URL"];

  let base = envBase || "http://localhost:3000";
  if (!base.startsWith("http")) {
    base = `https://${base}`;
  }

  if (!path.startsWith("/")) {
    return `${base}/${path}`;
  }
  return `${base}${path}`;
}

function buildSearchQS(args: {
  q: string;
  category: string;
  subcategory: string;
  brand: string;
  condition: string;
  featuredOnly: boolean;
  minPrice: number | undefined;
  maxPrice: number | undefined;
  sort: Sort;
  page: number;
  pageSize: number;
}) {
  const qp = new URLSearchParams();
  if (args.q) qp.set("q", args.q);
  if (args.category) qp.set("category", args.category);
  if (args.subcategory) qp.set("subcategory", args.subcategory);
  if (args.brand) qp.set("brand", args.brand);
  if (args.condition) qp.set("condition", args.condition);
  if (args.featuredOnly) qp.set("featured", "true");
  if (typeof args.minPrice === "number") qp.set("minPrice", String(args.minPrice));
  if (typeof args.maxPrice === "number") qp.set("maxPrice", String(args.maxPrice));
  qp.set("sort", args.sort);
  qp.set("page", String(args.page));
  qp.set("pageSize", String(args.pageSize));
  return qp.toString();
}

async function fetchEnvelope<T>(
  kind: "product" | "service",
  qs: string,
  pageSize: number,
): Promise<Envelope<T>> {
  const empty: Envelope<T> = {
    page: 1,
    pageSize,
    total: 0,
    totalPages: 1,
    items: [],
  };

  const path = kind === "product" ? "/api/products" : "/api/services";
  const url = `${makeApiUrl(path)}${qs ? `?${qs}` : ""}`;

  try {
    const res = await fetch(url, {
      cache: "no-store",
    });

    if (!res.ok) {
      return empty;
    }

    const json = (await res.json()) as any;
    const rawItems = Array.isArray(json?.items) ? json.items : [];

    return {
      page: typeof json?.page === "number" ? json.page : 1,
      pageSize:
        typeof json?.pageSize === "number" ? json.pageSize : pageSize,
      total:
        typeof json?.total === "number" ? json.total : rawItems.length,
      totalPages:
        typeof json?.totalPages === "number" ? json.totalPages : 1,
      items: rawItems as T[],
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[search] failed to fetch %s results", kind, err);
    return empty;
  }
}

/** Title above the form */
function getHeaderTitle(type: string): string {
  switch (type) {
    case "product":
      return "Search Products";
    case "service":
      return "Search Services";
    default:
      return "Search";
  }
}

/** Label for the results section */
function getResultsLabel(type: string): string {
  switch (type) {
    case "product":
      return "Products";
    case "service":
      return "Services";
    default:
      return "Results";
  }
}

/** Subtitle text under the main header */
function getSubtitle(type: string, q: string): string {
  if (q) return `Results for “${q}”`;
  switch (type) {
    case "product":
      return "Find deals across products.";
    case "service":
      return "Find reliable services.";
    default:
      return "Search products & services.";
  }
}

/* ------------------------ page ------------------------ */

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams15>;
}) {
  const sp = await searchParams;

  // type – keep it as a plain string to avoid TS over-narrowing
  const rawType = (getParam(sp, "type") || "all").toLowerCase();
  const type =
    rawType === "product" || rawType === "service" ? rawType : "all";

  // core filters
  const q = (getParam(sp, "q") || "").trim();
  const category = (getParam(sp, "category") || "").trim();
  const subcategory = (getParam(sp, "subcategory") || "").trim();
  const brand = (getParam(sp, "brand") || "").trim();
  const condition = (getParam(sp, "condition") || "").trim();
  const featuredOnly = toBool(getParam(sp, "featured"));
  const minPrice = toNum(getParam(sp, "minPrice"));
  const maxPrice = toNum(getParam(sp, "maxPrice"));
  const pageSize = Math.min(
    48,
    Math.max(1, toNum(getParam(sp, "pageSize"), 24) || 24),
  );
  const page = Math.max(1, toNum(getParam(sp, "page"), 1) || 1);

  const sortRaw = (getParam(sp, "sort") || "newest").toLowerCase();
  const sort: Sort =
    sortRaw === "featured"
      ? "featured"
      : sortRaw === "price_asc" || sortRaw === "price-asc"
      ? "price_asc"
      : sortRaw === "price_desc" || sortRaw === "price-desc"
      ? "price_desc"
      : "newest";

  const anyAdvanced =
    !!brand ||
    !!condition ||
    typeof minPrice === "number" ||
    typeof maxPrice === "number" ||
    !!category ||
    !!subcategory ||
    featuredOnly;

  // tab hrefs (URL-driven)
  const tabAllHref = keepQuery(
    "/search",
    sp,
    { type: null },
    { dropPageOnChange: true },
  );
  const tabProdHref = keepQuery(
    "/search",
    sp,
    { type: "product" },
    { dropPageOnChange: true },
  );
  const tabSvcHref = keepQuery(
    "/search",
    sp,
    { type: "service" },
    { dropPageOnChange: true },
  );

  const headerTitle = getHeaderTitle(type);
  const subtitle = getSubtitle(type, q);

  // Always hit real APIs – no demo placeholders
  const qs = buildSearchQS({
    q,
    category,
    subcategory,
    brand,
    condition,
    featuredOnly,
    minPrice,
    maxPrice,
    sort,
    page,
    pageSize,
  });

  let total = 0;
  let items: SearchResultItem[] = [];

  if (type === "product") {
    const env = await fetchEnvelope<any>("product", qs, pageSize);
    total = env.total;
    items = env.items.map((p: any): SearchResultItem => ({
      kind: "product",
      id: String(p.id),
      name: String(p.name ?? p.title ?? "Untitled"),
      href: `/product/${encodeURIComponent(String(p.id))}`,
    }));
  } else if (type === "service") {
    const env = await fetchEnvelope<any>("service", qs, pageSize);
    total = env.total;
    items = env.items.map((s: any): SearchResultItem => ({
      kind: "service",
      id: String(s.id),
      name: String(s.name ?? s.title ?? "Untitled"),
      href: `/service/${encodeURIComponent(String(s.id))}`,
    }));
  } else {
    const [prodEnv, svcEnv] = await Promise.all([
      fetchEnvelope<any>("product", qs, pageSize),
      fetchEnvelope<any>("service", qs, pageSize),
    ]);
    total = (prodEnv.total || 0) + (svcEnv.total || 0);

    items = [
      ...prodEnv.items.map((p: any): SearchResultItem => ({
        kind: "product",
        id: String(p.id),
        name: String(p.name ?? p.title ?? "Untitled"),
        href: `/product/${encodeURIComponent(String(p.id))}`,
      })),
      ...svcEnv.items.map((s: any): SearchResultItem => ({
        kind: "service",
        id: String(s.id),
        name: String(s.name ?? s.title ?? "Untitled"),
        href: `/service/${encodeURIComponent(String(s.id))}`,
      })),
    ].slice(0, pageSize);
  }

  const resultsLabel = getResultsLabel(type);

  return (
    <main className="container-page py-6">
      {/* Heading containing "Search" (asserted by tests) */}
      <SectionHeader
        title={headerTitle}
        subtitle={subtitle}
        actions={
          <Link
            href="/"
            prefetch={false}
            className="rounded-lg bg-black/5 px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-black/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
          >
            Home
          </Link>
        }
      />

      {/* Tabs: driven by URL; SSR-stable */}
      <nav className="mt-3 flex items-center gap-2">
        <TabLink href={tabAllHref} current={type === "all"}>
          All
        </TabLink>
        <TabLink href={tabProdHref} current={type === "product"}>
          Products
        </TabLink>
        <TabLink href={tabSvcHref} current={type === "service"}>
          Services
        </TabLink>
      </nav>

      {/* Canonical GET filter form; SSR-visible; no client gating */}
      <form
        className="mt-4 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        method="GET"
        action="/search"
      >
        {/* Row 1: query + type */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-7">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Search
            </label>
            <input
              name="q"
              defaultValue={q}
              placeholder="Search products & services…"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-[#161748] focus:ring-1 focus:ring-[#161748] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Type
            </label>
            <select
              name="type"
              defaultValue={type}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-[#161748] focus:ring-1 focus:ring-[#161748] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="all">All</option>
              <option value="product">Products</option>
              <option value="service">Services</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Featured only
            </label>
            <div className="mt-2 flex items-center gap-2">
              <input
                id="featured-only"
                type="checkbox"
                name="featured"
                value="1"
                defaultChecked={featuredOnly}
                className="h-4 w-4 rounded border-slate-300 text-[#161748] focus:ring-[#161748]"
              />
              <label
                htmlFor="featured-only"
                className="text-xs text-slate-700 dark:text-slate-300"
              >
                Only featured
              </label>
            </div>
          </div>
        </div>

        {/* Row 2: category / brand / condition */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-4">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Category
            </label>
            <input
              name="category"
              defaultValue={category}
              placeholder="Any category"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-[#161748] focus:ring-1 focus:ring-[#161748] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Subcategory
            </label>
            <input
              name="subcategory"
              defaultValue={subcategory}
              placeholder="Any subcategory"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-[#161748] focus:ring-1 focus:ring-[#161748] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Brand
            </label>
            <input
              name="brand"
              defaultValue={brand}
              placeholder="Any brand"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-[#161748] focus:ring-1 focus:ring-[#161748] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        </div>

        {/* Row 3: price + condition + sort */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Min price (KES)
            </label>
            <NumberInputNoWheel
              name="minPrice"
              defaultValue={minPrice ?? ""}
              placeholder="0"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-[#161748] focus:ring-1 focus:ring-[#161748] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Max price (KES)
            </label>
            <NumberInputNoWheel
              name="maxPrice"
              defaultValue={maxPrice ?? ""}
              placeholder="Any"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-[#161748] focus:ring-1 focus:ring-[#161748] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Condition
            </label>
            <input
              name="condition"
              defaultValue={condition}
              placeholder="Any"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-[#161748] focus:ring-1 focus:ring-[#161748] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Sort
            </label>
            <select
              name="sort"
              defaultValue={sort}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-[#161748] focus:ring-1 focus:ring-[#161748] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="newest">Newest</option>
              <option value="featured">Featured first</option>
              <option value="price_asc">Price: Low → High</option>
              <option value="price_desc">Price: High → Low</option>
            </select>
          </div>
        </div>

        {/* Hidden page/pageSize to keep URL-driven behavior consistent */}
        <input type="hidden" name="pageSize" value={String(pageSize)} />

        {/* Actions */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="inline-flex items-center rounded-lg bg-[#161748] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#161748]/90 dark:bg-[#39a0ca] dark:hover:bg-[#39a0ca]/90"
          >
            Apply filters
          </button>
          <Link
            href="/search"
            prefetch={false}
            className="text-xs text-slate-600 underline hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
          >
            Reset
          </Link>
          {anyAdvanced && (
            <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Advanced filters active
            </span>
          )}
        </div>
      </form>

      {/* Result shell: SSR-only, stable, always includes "Showing" */}
      <section className="mt-6 rounded-xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-slate-100">
            {resultsLabel}
          </h2>
          <span className="text-xs text-gray-500 dark:text-slate-400">
            Showing {total} result{total === 1 ? "" : "s"}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-6 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
            No results yet. Try adjusting your filters.
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {items.map((r) => (
              <li
                key={`${r.kind}-${r.id}`}
                className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-sm shadow-sm hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/70 dark:hover:bg-slate-800"
              >
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {r.kind === "product" ? "Product" : "Service"}
                </div>
                <Link
                  href={r.href}
                  prefetch={false}
                  className="font-medium text-[#161748] underline dark:text-[#39a0ca]"
                >
                  {r.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/* ------------------------ sub components ------------------------ */

function TabLink({
  href,
  current,
  children,
}: {
  href: string;
  current?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={current ? "page" : undefined}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
        current
          ? "bg-[#161748] text-white"
          : "bg-black/5 text-gray-800 hover:bg-black/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
      }`}
    >
      {children}
    </Link>
  );
}
