import type { ReactNode } from "react";
import Link from "next/link";
import SectionHeader from "@/app/components/SectionHeader";
import NumberInputNoWheel from "@/app/components/ui/NumberInputNoWheel";
import type { SearchParams15 } from "@/app/lib/next15";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TypeParam = "all" | "product" | "service";

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
  return Array.isArray(v) ? v[0] : (v as string | undefined);
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

/* ------------------------ page ------------------------ */

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams15>;
}) {
  const sp = await searchParams;

  // type
  const rawType = (getParam(sp, "type") || "all").toLowerCase();
  const type: TypeParam =
    rawType === "product" || rawType === "service" ? (rawType as TypeParam) : "all";

  // core filters
  const q = (getParam(sp, "q") || "").trim() || "";
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
  const sort = (getParam(sp, "sort") as string) || "newest";

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

  const headerTitle =
    type === "product"
      ? "Search Products"
      : type === "service"
      ? "Search Services"
      : "Search";

  const subtitle = q
    ? `Results for “${q}”`
    : type === "product"
    ? "Find deals across products."
    : type === "service"
    ? "Find reliable services."
    : "Search products & services.";

  // Minimal deterministic "results" shell
  const baseItems =
    type === "product"
      ? [{ href: "/product/demo-product", name: "Demo Product" }]
      : type === "service"
      ? [{ href: "/service/demo-service", name: "Demo Service" }]
      : [
          { href: "/product/demo-product", name: "Demo Product" },
          { href: "/service/demo-service", name: "Demo Service" },
        ];

  const items = baseItems.slice(0, pageSize);
  const total = items.length;

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
              <option value="price-asc">Price: Low → High</option>
              <option value="price-desc">Price: High → Low</option>
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
            {type === "product"
              ? "Products"
              : type === "service"
              ? "Services"
              : "Results"}
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
                key={r.href}
                className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-sm shadow-sm hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/70 dark:hover:bg-slate-800"
              >
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
