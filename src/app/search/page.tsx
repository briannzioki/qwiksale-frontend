// src/app/search/page.tsx
import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import SectionHeader from "@/app/components/SectionHeader";
import NumberInputNoWheel from "@/app/components/ui/NumberInputNoWheel";
import SuggestInput from "@/app/components/SuggestInput";
import type { SearchParams15 } from "@/app/lib/next15";
import type { Sort } from "./SearchClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SearchResultItem = {
  kind: "product" | "service";
  id: string;
  name: string;
  href: string;
  imageUrl?: string | null;
  categoryLabel?: string | null;
  priceLabel?: string | null;
};

type Envelope<T> = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: T[];
};

export const metadata: Metadata = {
  title: "Search · QwikSale",
  description: "Search products and services listed on QwikSale across Kenya.",
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
      pageSize: typeof json?.pageSize === "number" ? json.pageSize : pageSize,
      total: typeof json?.total === "number" ? json.total : rawItems.length,
      totalPages: typeof json?.totalPages === "number" ? json.totalPages : 1,
      items: rawItems as T[],
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[search] failed to fetch %s results", kind, err);
    return empty;
  }
}

/* ---------- normalization helpers to make cards look like home ---------- */

function getPrimaryImage(raw: any): string | null {
  if (!raw || typeof raw !== "object") return null;

  const candidates: unknown[] = [
    raw.image,
    raw.imageUrl,
    raw.primaryImage,
    raw.coverImage,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }

  if (Array.isArray(raw.images) && raw.images.length > 0) {
    const first = raw.images[0];
    if (typeof first === "string" && first.trim()) return first;
    if (first && typeof first.url === "string" && first.url.trim())
      return first.url;
  }

  if (Array.isArray(raw.gallery) && raw.gallery.length > 0) {
    const first = raw.gallery[0];
    if (typeof first === "string" && first.trim()) return first;
    if (first && typeof first.url === "string" && first.url.trim())
      return first.url;
  }

  return null;
}

function getCategoryLabel(raw: any): string | null {
  if (!raw || typeof raw !== "object") return null;

  const catCandidates: unknown[] = [
    raw.categoryName,
    raw.category,
    raw.categoryLabel,
  ];
  const subCandidates: unknown[] = [
    raw.subcategoryName,
    raw.subcategory,
    raw.subcategoryLabel,
  ];

  const cat = catCandidates.find((v) => typeof v === "string" && v.trim());
  const sub = subCandidates.find((v) => typeof v === "string" && v.trim());

  if (cat && sub) return `${String(cat)} • ${String(sub)}`;
  if (cat) return String(cat);
  if (sub) return String(sub);
  return null;
}

function getPriceLabel(raw: any, kind: "product" | "service"): string | null {
  if (!raw || typeof raw !== "object") return null;

  const display = raw.priceDisplay ?? raw.priceText ?? raw.displayPrice;
  if (typeof display === "string" && display.trim()) return display;

  const price = raw.price ?? raw.rate;
  if (typeof price === "number" && Number.isFinite(price)) {
    try {
      return new Intl.NumberFormat("en-KE", {
        style: "currency",
        currency: "KES",
        maximumFractionDigits: 0,
      }).format(price);
    } catch {
      return `KES ${price.toLocaleString("en-KE")}`;
    }
  }

  const priceType = raw.priceType ?? raw.pricingMode ?? raw.billingType;
  if (
    typeof priceType === "string" &&
    priceType.toLowerCase().includes("contact")
  ) {
    return "Contact for price";
  }

  if (kind === "service") return "Contact for quote";
  return null;
}

function buildResultItem(
  raw: any,
  kind: "product" | "service",
): SearchResultItem {
  const id = raw?.id ?? raw?.productId ?? raw?.serviceId;
  const name = raw?.name ?? raw?.title ?? "Untitled";

  const href =
    kind === "product"
      ? `/product/${encodeURIComponent(String(id))}`
      : `/service/${encodeURIComponent(String(id))}`;

  return {
    kind,
    id: String(id ?? ""),
    name: String(name),
    href,
    imageUrl: getPrimaryImage(raw),
    categoryLabel: getCategoryLabel(raw),
    priceLabel: getPriceLabel(raw, kind),
  };
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

  // type – keep it as a plain string union to avoid TS over-narrowing
  const rawType = (getParam(sp, "type") || "all").toLowerCase();
  const type = rawType === "product" || rawType === "service" ? rawType : "all";

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

  // Always hit real APIs
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
    items = env.items.map((p: any) => buildResultItem(p, "product"));
  } else if (type === "service") {
    const env = await fetchEnvelope<any>("service", qs, pageSize);
    total = env.total;
    items = env.items.map((s: any) => buildResultItem(s, "service"));
  } else {
    const [prodEnv, svcEnv] = await Promise.all([
      fetchEnvelope<any>("product", qs, pageSize),
      fetchEnvelope<any>("service", qs, pageSize),
    ]);
    total = (prodEnv.total || 0) + (svcEnv.total || 0);

    items = [
      ...prodEnv.items.map((p: any) => buildResultItem(p, "product")),
      ...svcEnv.items.map((s: any) => buildResultItem(s, "service")),
    ].slice(0, pageSize);
  }

  const resultsLabel = getResultsLabel(type);

  const requestKind: "product" | "service" =
    type === "service" ? "service" : "product";
  const requestHref = (() => {
    const qp = new URLSearchParams();
    qp.set("kind", requestKind);
    if (q) qp.set("title", q);
    return `/requests/new?${qp.toString()}`;
  })();

  const showRequestCta = items.length === 0 || items.length < 3;

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
            className="rounded-lg border border-border bg-card/80 px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm hover:bg-card"
          >
            Home
          </Link>
        }
      />

      {/* SuggestInput powered by /api/suggest (Playwright checks this combobox) */}
      <div className="mt-4 max-w-xl">
        <SuggestInput
          endpoint="/api/suggest"
          value={q}
          name="q"
          placeholder="Search products, services, or stores…"
          ariaLabel="Search"
          minLength={2}
          limit={10}
        />
      </div>

      {/* Tabs: driven by URL; SSR-stable */}
      <nav className="mt-4 flex items-center gap-2">
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
        className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/40 p-4 shadow-sm"
        method="GET"
        action="/search"
      >
        {/* Row 1: query + type */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-7">
            <label className="block text-xs font-semibold text-muted-foreground">
              Search
            </label>
            <input
              name="q"
              defaultValue={q}
              placeholder="Search products & services…"
              className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-muted-foreground">
              Type
            </label>
            <select
              name="type"
              defaultValue={type}
              className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">All</option>
              <option value="product">Products</option>
              <option value="service">Services</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-muted-foreground">
              Featured only
            </label>
            <div className="mt-2 flex items-center gap-2">
              <input
                id="featured-only"
                type="checkbox"
                name="featured"
                value="1"
                defaultChecked={featuredOnly}
                className="h-4 w-4 rounded border-border text-[#161748] focus:ring-[#161748]"
              />
              <label
                htmlFor="featured-only"
                className="text-xs text-muted-foreground"
              >
                Only featured
              </label>
            </div>
          </div>
        </div>

        {/* Row 2: category / brand / condition */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-4">
            <label className="block text-xs font-semibold text-muted-foreground">
              Category
            </label>
            <input
              name="category"
              defaultValue={category}
              placeholder="Any category"
              className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs font-semibold text-muted-foreground">
              Subcategory
            </label>
            <input
              name="subcategory"
              defaultValue={subcategory}
              placeholder="Any subcategory"
              className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs font-semibold text-muted-foreground">
              Brand
            </label>
            <input
              name="brand"
              defaultValue={brand}
              placeholder="Any brand"
              className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        {/* Row 3: price + condition + sort */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-muted-foreground">
              Min price (KES)
            </label>
            <NumberInputNoWheel
              name="minPrice"
              defaultValue={minPrice ?? ""}
              placeholder="0"
              className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-muted-foreground">
              Max price (KES)
            </label>
            <NumberInputNoWheel
              name="maxPrice"
              defaultValue={maxPrice ?? ""}
              placeholder="Any"
              className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-muted-foreground">
              Condition
            </label>
            <input
              name="condition"
              defaultValue={condition}
              placeholder="Any"
              className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-muted-foreground">
              Sort
            </label>
            <select
              name="sort"
              defaultValue={sort}
              className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            className="inline-flex items-center rounded-lg bg-[#161748] px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-[#161748]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Apply filters
          </button>
          <Link
            href="/search"
            prefetch={false}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Reset
          </Link>
          {anyAdvanced && (
            <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Advanced filters active
            </span>
          )}
        </div>
      </form>

      {/* Result shell: SSR-only, stable, always includes "Showing" */}
      <section className="mt-6 rounded-xl border border-border bg-card/90 p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            {resultsLabel}
          </h2>
          <span className="text-xs text-muted-foreground">
            Showing {total} result{total === 1 ? "" : "s"}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            No results yet. Try adjusting your filters.
            {showRequestCta && (
              <div className="mt-3">
                <Link
                  href={requestHref}
                  prefetch={false}
                  className="inline-flex items-center rounded-lg border border-border bg-card/80 px-3 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-card"
                >
                  Didn’t find it? Post a request
                </Link>
              </div>
            )}
          </div>
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((r) => (
                <li key={`${r.kind}-${r.id}`}>
                  <Link
                    href={r.href}
                    prefetch={false}
                    className="group block h-full overflow-hidden rounded-2xl border border-border bg-card/90 shadow-sm transition hover:border-brandBlue/70 hover:bg-card"
                    aria-label={`${
                      r.kind === "product" ? "Product" : "Service"
                    }: ${r.name}`}
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                      {r.imageUrl ? (
                        <img
                          src={r.imageUrl}
                          alt={r.name}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[11px] uppercase tracking-wide text-muted-foreground">
                          No photo
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {r.kind === "product" ? "Product" : "Service"}
                      </div>
                      <div className="mt-1 line-clamp-2 text-sm font-semibold text-foreground">
                        {r.name}
                      </div>
                      {r.categoryLabel && (
                        <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                          {r.categoryLabel}
                        </div>
                      )}
                      {r.priceLabel && (
                        <div className="mt-2 text-sm font-semibold text-brandBlue">
                          {r.priceLabel}
                        </div>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {showRequestCta && (
              <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
                <div className="text-sm font-semibold text-foreground">
                  Didn’t find it? Post a request
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Tell sellers what you need and get offers faster.
                </div>
                <div className="mt-3">
                  <Link
                    href={requestHref}
                    prefetch={false}
                    className="inline-flex items-center rounded-lg bg-[#161748] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#161748]/90"
                  >
                    Post a request
                  </Link>
                </div>
              </div>
            )}
          </>
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
          ? "bg-[#161748] text-white shadow-sm"
          : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
      }`}
    >
      {children}
    </Link>
  );
}
