// src/app/_components/HomeClient.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import HomeTabs from "@/app/components/HomeTabs";
import FavoriteButton from "@/app/components/favorites/FavoriteButton";
import type { HomeSeedProps } from "./HomeClientNoSSR";

type Mode = "all" | "products" | "services";
type FeaturedTier = "basic" | "gold" | "diamond";

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

  /** Seller/account flags for public UI */
  sellerVerified?: boolean | null;
  sellerFeaturedTier?: FeaturedTier | null;
};

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

  /** Seller/account flags for public UI */
  sellerVerified?: boolean | null;
  sellerFeaturedTier?: FeaturedTier | null;
};

type AnyItem = ProductItem | ServiceItem;

type PageResponse<TItems> = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: TItems[];
};

type ErrorResponse = { error?: string } | { message?: string };

const PAGE_SIZE = 24;
const DEBOUNCE_MS = 300;
const FALLBACK_IMG = "/placeholder/default.jpg";

/**
 * Hard upper bound for the home-feed fetch on the client.
 * If the endpoint misbehaves under load, we abort the request so the
 * browser can still reach "network idle" instead of hanging the suite.
 */
const HOME_FEED_TIMEOUT_MS = 4000;

/* --------------------------- helpers --------------------------- */

const fmtKES = (n?: number | null) =>
  typeof n === "number" && Number.isFinite(n) && n > 0
    ? `KES ${n.toLocaleString("en-KE", {
        maximumFractionDigits: 0,
      })}`
    : "Contact for price";

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
    <animate xlink:href="#r" attributeName="x" from="-${width}" to="${width}" dur="1.2s" repeatCount="indefinite" />
  </svg>`;

  const encode = (str: string) => {
    if (typeof window === "undefined") {
      return Buffer.from(str, "utf8").toString("base64");
    }
    return typeof btoa === "function"
      ? btoa(str)
      : Buffer.from(str, "utf8").toString("base64");
  };

  return `data:image/svg+xml;base64,${encode(svg)}`;
}

const makeOnImgError =
  (fallback: string) =>
  (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img && img.src !== fallback) {
      img.src = fallback;
    }
  };

function useDebounced<T>(value: T, delay = DEBOUNCE_MS): T {
  const [debounced, setDebounced] = React.useState<T>(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function coerceFeaturedTier(v: unknown): FeaturedTier | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("diamond")) return "diamond";
  if (s.includes("gold")) return "gold";
  if (s.includes("basic")) return "basic";
  return null;
}

function pickSellerVerified(raw: any): boolean | null {
  if (!raw || typeof raw !== "object") return null;

  const seller = raw?.seller ?? raw?.user ?? raw?.owner ?? null;

  const candidates: unknown[] = [
    raw?.sellerVerified,
    raw?.seller_verified,
    raw?.accountVerified,
    raw?.account_verified,
    seller?.verified,
    seller?.isVerified,
    seller?.sellerVerified,
    seller?.accountVerified,
  ];

  for (const c of candidates) {
    if (typeof c === "boolean") return c;
  }

  const hasSellerContext = Boolean(
    raw?.sellerId ||
      raw?.sellerName ||
      raw?.seller ||
      raw?.user ||
      raw?.owner ||
      seller,
  );

  if (hasSellerContext && typeof raw?.verified === "boolean") {
    return raw.verified;
  }

  return null;
}

function pickSellerFeaturedTier(raw: any): FeaturedTier | null {
  if (!raw || typeof raw !== "object") return null;

  const seller = raw?.seller ?? raw?.user ?? raw?.owner ?? null;

  const candidates: unknown[] = [
    seller?.featuredTier,
    seller?.featured_tier,
    seller?.tier,
    seller?.featuredLevel,
    raw?.sellerFeaturedTier,
    raw?.seller_featured_tier,
    raw?.accountFeaturedTier,
    raw?.account_featured_tier,
    raw?.featuredTier,
    raw?.featured_tier,
  ];

  for (const c of candidates) {
    const t = coerceFeaturedTier(c);
    if (t) return t;
  }

  return null;
}

/* ------------------------ Seller pill UI (brand-consistent) ------------------------ */

function VerifiedPill({ verified }: { verified: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        verified
          ? "border-emerald-500/30 bg-emerald-600/10 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "border-border bg-muted text-muted-foreground",
      ].join(" ")}
      aria-label={verified ? "Verified seller" : "Unverified seller"}
    >
      <span className="text-[10px]" aria-hidden="true">
        {verified ? "✓" : "✕"}
      </span>{" "}
      <span>{verified ? "Verified" : "Unverified"}</span>
    </span>
  );
}

function TierPill({ tier }: { tier: FeaturedTier }) {
  const base =
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold";
  if (tier === "gold") {
    return (
      <span
        className={`${base} border-amber-400/40 bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 text-amber-950 dark:border-amber-900/40 dark:from-amber-900/25 dark:via-amber-900/10 dark:to-amber-900/25 dark:text-amber-100`}
        aria-label="Featured tier gold"
      >
        <span className="text-[10px]" aria-hidden="true">
          ★
        </span>{" "}
        <span>gold</span>
      </span>
    );
  }

  if (tier === "diamond") {
    return (
      <span
        className={`${base} border-sky-300/50 bg-gradient-to-r from-sky-200 via-cyan-100 to-indigo-200 text-slate-900 dark:border-sky-900/40 dark:from-sky-900/25 dark:via-sky-900/10 dark:to-sky-900/25 dark:text-slate-100`}
        aria-label="Featured tier diamond"
      >
        <span className="text-[10px]" aria-hidden="true">
          ◆
        </span>{" "}
        <span>diamond</span>
      </span>
    );
  }

  return (
    <span
      className={`${base} border-border bg-muted text-foreground`}
      aria-label="Featured tier basic"
    >
      <span className="text-[10px]" aria-hidden="true">
        ★
      </span>{" "}
      <span>basic</span>
    </span>
  );
}

function SellerBadges({
  verified,
  tier,
}: {
  verified?: boolean | null;
  tier?: FeaturedTier | null;
}) {
  const showVerified = typeof verified === "boolean";
  const showTier = !!tier;

  if (!showVerified && !showTier) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {showVerified ? <VerifiedPill verified={Boolean(verified)} /> : null}
      {tier ? <TierPill tier={tier} /> : null}
    </div>
  );
}

function coerceItems(json: any): PageResponse<AnyItem> {
  const base = json?.page || json?.page === 0 ? json : json?.data || json;

  const rawItems: any[] =
    (Array.isArray(base?.items) && base.items) ||
    (Array.isArray(base?.results) && base.results) ||
    (Array.isArray(base) && base) ||
    [];

  const items: AnyItem[] = rawItems
    .map((x): AnyItem | null => {
      if (!x || !x.id) return null;

      const type: string =
        x.type || x.kind || (x.serviceArea ? "service" : "product");

      const common = {
        id: String(x.id),
        name: String(x.name ?? x.title ?? "Untitled"),
        category: x.category ?? null,
        subcategory: x.subcategory ?? null,
        price:
          typeof x.price === "number"
            ? x.price
            : typeof x.amount === "number"
              ? x.amount
              : null,
        image:
          x.image ||
          x.thumbnail ||
          (Array.isArray(x.images) ? x.images[0] : null) ||
          null,
        featured:
          typeof x.featured === "boolean"
            ? x.featured
            : x.isFeatured === true
              ? true
              : null,
        location: x.location ?? x.city ?? null,
        createdAt: x.createdAt ?? x.created_at ?? null,

        sellerVerified: pickSellerVerified(x),
        sellerFeaturedTier: pickSellerFeaturedTier(x),
      };

      if (type === "service") {
        return {
          type: "service",
          ...common,
        } as ServiceItem;
      }

      return {
        type: "product",
        ...common,
        condition: x.condition ?? null,
        brand: x.brand ?? null,
      } as ProductItem;
    })
    .filter(Boolean) as AnyItem[];

  const total =
    typeof base?.total === "number"
      ? base.total
      : typeof json?.total === "number"
        ? json.total
        : items.length;

  const pageSize =
    typeof base?.pageSize === "number" ? base.pageSize : PAGE_SIZE;

  const page =
    typeof base?.page === "number" && base.page > 0 ? base.page : 1;

  const totalPages =
    typeof base?.totalPages === "number" && base.totalPages > 0
      ? base.totalPages
      : Math.max(1, Math.ceil(total / pageSize));

  return {
    page,
    pageSize,
    total,
    totalPages,
    items,
  };
}

/* --------------------------- component --------------------------- */

export default function HomeClient(seed?: HomeSeedProps) {
  const sp = useSearchParams();

  // Mode from URL (?t= / ?tab=); strictly read-only.
  const mode: Mode = React.useMemo(() => {
    const raw = (sp.get("t") ?? sp.get("tab") ?? "").toLowerCase();
    return raw === "products" || raw === "services" ? (raw as Mode) : "all";
  }, [sp]);

  const initialServices = seed?.initialServices;
  const hasSeedServices =
    mode === "services" &&
    Array.isArray(initialServices) &&
    initialServices.length > 0;

  // Local filters from URL (no client-driven URL mutations)
  const [q, setQ] = React.useState(sp.get("q") || "");
  const [category, setCategory] = React.useState(sp.get("category") || "");
  const [subcategory, setSubcategory] = React.useState(
    sp.get("subcategory") || "",
  );
  const [brand, setBrand] = React.useState(sp.get("brand") || "");
  const [condition, setCondition] = React.useState(sp.get("condition") || "");
  const [minPrice, setMinPrice] = React.useState(sp.get("minPrice") || "");
  const [maxPrice, setMaxPrice] = React.useState(sp.get("maxPrice") || "");
  const [featuredOnly, setFeaturedOnly] = React.useState(
    (sp.get("featured") || "").toLowerCase() === "true",
  );
  const [sort, setSort] = React.useState(sp.get("sort") || "newest");
  const [page, setPage] = React.useState(() => {
    const n = Number(sp.get("page") || 1);
    return Number.isFinite(n) && n > 0 ? n : 1;
  });

  // Reset product-only filters when mode changes away
  React.useEffect(() => {
    if (mode !== "products") {
      if (brand) setBrand("");
      if (condition) setCondition("");
    }
  }, [mode, brand, condition]);

  const dmode = useDebounced<Mode>(mode);
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

  const [res, setRes] = React.useState<PageResponse<AnyItem> | null>(() => {
    if (!hasSeedServices || !initialServices) return null;

    const mapped: AnyItem[] = initialServices.map((svc) => {
      const anySvc = svc as any;
      return {
        type: "service",
        id: String(svc.id),
        name:
          typeof svc.name === "string"
            ? svc.name
            : typeof anySvc.title === "string"
              ? anySvc.title
              : "Service",
        category: typeof svc.category === "string" ? svc.category : null,
        subcategory: typeof svc.subcategory === "string" ? svc.subcategory : null,
        price:
          typeof svc.price === "number"
            ? svc.price
            : typeof anySvc.amount === "number"
              ? anySvc.amount
              : null,
        image:
          typeof svc.image === "string"
            ? svc.image
            : Array.isArray(anySvc.images) && anySvc.images.length > 0
              ? anySvc.images[0]
              : null,
        featured:
          typeof anySvc.featured === "boolean"
            ? anySvc.featured
            : anySvc.isFeatured === true
              ? true
              : null,
        location:
          typeof svc.location === "string"
            ? svc.location
            : typeof anySvc.city === "string"
              ? anySvc.city
              : null,
        createdAt: null,

        sellerVerified: pickSellerVerified(anySvc),
        sellerFeaturedTier: pickSellerFeaturedTier(anySvc),
      } as ServiceItem;
    });

    return {
      page: 1,
      pageSize: mapped.length,
      total: mapped.length,
      totalPages: 1,
      items: mapped,
    };
  });

  const [loading, setLoading] = React.useState<boolean>(() => !hasSeedServices);
  const [err, setErr] = React.useState<string | null>(null);

  // Build query for /api/home-feed
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

  // Fetch from /api/home-feed; mode-aware; URL is read-only (no replace).
  React.useEffect(() => {
    const ac = new AbortController();
    let timeoutId: number | undefined;
    let active = true;

    async function load(attempt = 1, fallbackMode?: Mode): Promise<void> {
      if (!active) return;

      if (attempt === 1 && !fallbackMode) {
        setLoading(true);
        setErr(null);
      }

      const tParam = fallbackMode ?? dmode;
      const url =
        `/api/home-feed?t=${encodeURIComponent(tParam)}` +
        (queryString ? `&${queryString}` : "");

      try {
        const r = await fetch(url, {
          cache: "no-store",
          signal: ac.signal,
          headers: { Accept: "application/json" },
        });

        const jsonRaw: any =
          (await r.json().catch(() => ({} as ErrorResponse))) || {};

        const hasError =
          !r.ok ||
          (typeof (jsonRaw as any).error === "string" && (jsonRaw as any).error) ||
          (typeof (jsonRaw as any).message === "string" &&
            !Array.isArray((jsonRaw as any).items));

        if (hasError) {
          if (
            (dmode === "products" || dmode === "services") &&
            !fallbackMode &&
            active &&
            !ac.signal.aborted
          ) {
            return load(1, "all");
          }

          if (attempt < 2 && active && !ac.signal.aborted) {
            return load(attempt + 1, fallbackMode);
          }

          const msg =
            (jsonRaw as any).error ||
            (jsonRaw as any).message ||
            `Request failed (${r.status})`;

          if (active) {
            setErr(msg);
            setRes(null);
          }
          return;
        }

        let pageJson = coerceItems(jsonRaw);

        // If we fetched "all" as fallback, filter locally for tab visuals.
        if (
          (dmode === "products" || dmode === "services") &&
          fallbackMode === "all"
        ) {
          const want = dmode === "products" ? "product" : "service";
          const filtered = (pageJson.items || []).filter((x) => x.type === want);
          pageJson = {
            ...pageJson,
            items: filtered,
            total: filtered.length,
            totalPages: 1,
            page: 1,
          };
        }

        if (active) {
          setRes(pageJson);
          setErr(null);
        }
      } catch (e: any) {
        if (e?.name === "AbortError") {
          // Hard timeout or unmount: silent
          return;
        }
        if (attempt < 2 && active && !ac.signal.aborted) {
          return load(attempt + 1, fallbackMode);
        }
        if (active) {
          setErr("Network error. Please try again.");
          setRes(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    if (typeof window !== "undefined") {
      timeoutId = window.setTimeout(() => {
        if (!ac.signal.aborted) {
          ac.abort();
        }
      }, HOME_FEED_TIMEOUT_MS);
    }

    return () => {
      active = false;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      ac.abort();
    };
  }, [dmode, queryString]);

  const pageNum = res?.page ?? 1;
  const totalPages = res?.totalPages ?? 1;
  const total = res?.total ?? 0;
  const items: AnyItem[] = Array.isArray(res?.items) ? (res!.items as AnyItem[]) : [];
  const hasItems = items.length > 0;

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

  const activeChips: string[] = [];
  if (q) activeChips.push(`“${q}”`);
  if (category) activeChips.push(`Category: ${category}`);
  if (subcategory) activeChips.push(`Subcategory: ${subcategory}`);
  if (brand && mode === "products") activeChips.push(`Brand: ${brand}`);
  if (condition && mode === "products") activeChips.push(`Condition: ${condition}`);
  if (minPrice) activeChips.push(`Min: ${minPrice}`);
  if (maxPrice) activeChips.push(`Max: ${maxPrice}`);
  if (featuredOnly) activeChips.push("Featured only");
  if (sort && sort !== "newest")
    activeChips.push(
      sort === "price_asc"
        ? "Price ↑"
        : sort === "price_desc"
          ? "Price ↓"
          : "Featured first",
    );

  const makeChip = (label: string) => (
    <span
      key={label}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground shadow-sm"
    >
      {label}
    </span>
  );

  /* ------------------------ render ------------------------ */

  return (
    <div className="flex flex-col gap-6">
      {/* Tabs: All / Products / Services */}
      <div className="sticky top-[64px] z-30 card-surface p-2" aria-label="Browse type tabs">
        <HomeTabs />
      </div>

      {/* Filters row */}
      <section
        className="card-surface z-20 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:sticky md:top-[112px]"
        aria-label="Filters"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-4">
            <label className="block text-xs font-semibold text-muted-foreground">
              Keywords
            </label>
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search products & services…"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 ring-focus"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-muted-foreground">
              Category
            </label>
            <input
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              placeholder="Any"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 ring-focus"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-muted-foreground">
              Subcategory
            </label>
            <input
              value={subcategory}
              onChange={(e) => {
                setSubcategory(e.target.value);
                setPage(1);
              }}
              placeholder="Any"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 ring-focus"
            />
          </div>
          <div className="md:col-span-2 flex items-end">
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-muted px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/80 focus:outline-none focus:ring-2 ring-focus"
            >
              Clear filters
            </button>
          </div>
        </div>

        {/* Advanced / mode-specific filters */}
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-12">
          {mode === "products" && (
            <>
              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-muted-foreground">
                  Brand
                </label>
                <input
                  value={brand}
                  onChange={(e) => {
                    setBrand(e.target.value);
                    setPage(1);
                  }}
                  placeholder="e.g. Samsung"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 ring-focus"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-muted-foreground">
                  Condition
                </label>
                <select
                  value={condition}
                  onChange={(e) => {
                    setCondition(e.target.value);
                    setPage(1);
                  }}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 ring-focus"
                >
                  <option value="">Any</option>
                  <option value="brand new">Brand New</option>
                  <option value="pre-owned">Pre-Owned</option>
                </select>
              </div>
            </>
          )}

          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-muted-foreground">
              Min price (KES)
            </label>
            <input
              value={minPrice}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d]/g, "");
                setMinPrice(v);
                setPage(1);
              }}
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 ring-focus"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-muted-foreground">
              Max price (KES)
            </label>
            <input
              value={maxPrice}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d]/g, "");
                setMaxPrice(v);
                setPage(1);
              }}
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 ring-focus"
            />
          </div>

          <div className="md:col-span-3 flex items-end">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <input
                type="checkbox"
                checked={featuredOnly}
                onChange={(e) => {
                  setFeaturedOnly(e.target.checked);
                  setPage(1);
                }}
                className="h-4 w-4 rounded border border-border text-primary focus:outline-none focus:ring-2 ring-focus"
              />
              Featured only
            </label>
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-muted-foreground">
              Sort
            </label>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 ring-focus"
            >
              <option value="newest">Newest</option>
              <option value="featured">Featured first</option>
              <option value="price_asc">Price ↑</option>
              <option value="price_desc">Price ↓</option>
            </select>
          </div>
        </div>

        {/* Active filter chips */}
        {activeChips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">
              Active:
            </span>
            {activeChips.map(makeChip)}
          </div>
        )}
      </section>

      {/* Results */}
      {err ? (
        <div
          className="card-surface border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
          role="status"
        >
          {err}
        </div>
      ) : loading && !hasItems ? (
        <SkeletonGrid />
      ) : !hasItems ? (
        <div className="card-surface p-6 text-sm text-muted-foreground">
          No {mode === "all" ? "items" : mode} found. Try adjusting your filters.
        </div>
      ) : (
        <section
          id="search-results"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 sm:gap-6"
          aria-label="Home feed results"
          aria-busy={loading ? "true" : "false"}
        >
          {items.map((it, index) => {
            const isProduct = it.type === "product";
            const title = it.name || (isProduct ? "Product" : "Service");
            const imageUrl = it.image || FALLBACK_IMG;
            const price = it.price ?? null;
            const featured = it.featured ?? false;

            const c1 = it.category || "";
            const c2 = it.subcategory || "";
            const categoryText = c1 && c2 ? `${c1} • ${c2}` : c1 || c2 || "General";

            const href = isProduct
              ? `/product/${encodeURIComponent(it.id)}`
              : `/service/${encodeURIComponent(it.id)}`;

            const ariaLabelBase = `${isProduct ? "Product" : "Service"}: ${title}`;
            const pricePart =
              typeof price === "number" && price > 0
                ? `, priced at KES ${price.toLocaleString("en-KE")}`
                : "";
            const ariaLabel = ariaLabelBase + pricePart;

            const blur = shimmer(800, 440);

            return (
              <Link
                key={`${it.type}-${it.id}-${index}`}
                href={href}
                className="group relative block"
                aria-label={ariaLabel}
                data-product-id={isProduct ? it.id : undefined}
                data-service-id={!isProduct ? it.id : undefined}
              >
                <div className="card-surface relative overflow-hidden rounded-xl border border-border shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="relative">
                    {featured && (
                      <span className="absolute left-2 top-2 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs font-semibold text-white shadow">
                        Featured
                      </span>
                    )}
                    <Image
                      alt={title}
                      src={imageUrl}
                      width={800}
                      height={440}
                      className="h-44 w-full bg-muted object-cover transition-transform duration-300 group-hover:scale-105"
                      placeholder="blur"
                      blurDataURL={blur}
                      loading="lazy"
                      onError={makeOnImgError(FALLBACK_IMG)}
                    />
                    {isProduct && (
                      <div className="absolute right-2 top-2 z-10">
                        <FavoriteButton productId={it.id} />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="line-clamp-1 font-semibold text-foreground">{title}</h3>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{categoryText}</p>

                    <SellerBadges
                      verified={it.sellerVerified ?? null}
                      tier={it.sellerFeaturedTier ?? null}
                    />

                    <p className="mt-1 text-sm font-bold text-[#39a0ca] dark:text-[#7dd3fc]">
                      {fmtKES(price)}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      )}

      {/* Local pagination (does not touch URL) */}
      <section className="flex items-center justify-between" aria-live="polite">
        <p className="text-xs text-muted-foreground">
          {loading
            ? "Loading…"
            : err
              ? "Error loading listings."
              : `${total} items • Page ${pageNum} of ${totalPages}`}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading || pageNum <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className={`rounded-lg border px-3 py-1.5 text-xs transition ${
              !loading && pageNum > 1
                ? "border-border bg-card hover:bg-muted"
                : "border-border bg-muted/60 cursor-not-allowed opacity-50"
            }`}
            aria-label="Previous page"
          >
            ← Prev
          </button>
          <button
            type="button"
            disabled={loading || pageNum >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className={`rounded-lg border px-3 py-1.5 text-xs transition ${
              !loading && pageNum < totalPages
                ? "border-border bg-card hover:bg-muted"
                : "border-border bg-muted/60 cursor-not-allowed opacity-50"
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

/* --------------------------- skeleton --------------------------- */

function SkeletonGrid() {
  return (
    <section
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 sm:gap-6"
      aria-hidden="true"
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
        >
          <div className="h-44 w-full animate-pulse bg-muted" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </section>
  );
}
