// src/app/store/[username]/page.tsx
export const revalidate = 300;
export const runtime = "nodejs";

import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/app/lib/prisma";
import UserAvatar from "@/app/components/UserAvatar";
import SmartImage from "@/app/components/SmartImage";
import { makeApiUrl } from "@/app/lib/url";
import ReviewSummary from "@/app/components/ReviewSummary";
import ReviewStars from "@/app/components/ReviewStars";

/* ----------------------------- utils ----------------------------- */

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || n <= 0) return "Contact for price";
  try {
    return `KES ${new Intl.NumberFormat("en-KE", {
      maximumFractionDigits: 0,
    }).format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

/** Service-facing copy: Contact for quote */
function fmtServiceKES(n?: number | null) {
  if (typeof n !== "number" || n <= 0) return "Contact for quote";
  return fmtKES(n);
}

function cleanUsername(raw?: string) {
  const v = decodeURIComponent(String(raw ?? "")).trim();
  return /^[a-z0-9._-]{2,32}$/i.test(v) ? v : "";
}

function parseSellerId(raw?: string): string | null {
  const v = decodeURIComponent(String(raw ?? "")).trim();
  const m = /^u-(.+)$/i.exec(v);
  if (m && m[1]) return m[1].trim();
  if (/^[0-9a-f-]{24,36}$/i.test(v)) return v;
  return null;
}

async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let tid: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((resolve) => {
    tid = setTimeout(() => resolve(fallback), ms);
  });
  const result = await Promise.race([p.catch(() => fallback), timeout]);
  if (tid) clearTimeout(tid);
  return result;
}

type NextFetchInit = RequestInit & { next?: any };

/**
 * Next.js server fetch can hang under load (or when an upstream is slow).
 * For store navigation reliability, enforce a hard timeout and return null on failure.
 */
async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: NextFetchInit,
  ms: number,
): Promise<Response | null> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);

  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(tid);
  }
}

type RatingSummary = {
  average: number | null;
  count: number;
};

function aggregateListingRatings(
  products: Array<{ ratingAverage?: number | null; ratingCount?: number | null }>,
  services: Array<{ ratingAverage?: number | null; ratingCount?: number | null }>,
): RatingSummary {
  let totalStars = 0;
  let totalCount = 0;

  const all = [...products, ...services];
  for (const item of all) {
    const avg =
      typeof item.ratingAverage === "number" && item.ratingAverage > 0
        ? item.ratingAverage
        : null;
    const count =
      typeof item.ratingCount === "number" && item.ratingCount > 0
        ? item.ratingCount
        : 0;

    if (avg != null && count > 0) {
      totalStars += avg * count;
      totalCount += count;
    }
  }

  if (!totalCount) {
    return { average: null, count: 0 };
  }

  return { average: totalStars / totalCount, count: totalCount };
}

/* ----------------------------- Metadata ----------------------------- */

type MetaUser = {
  id: string;
  username: string | null;
  name: string | null;
};

type MetaUserRow = MetaUser | null;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username: raw } = await params;
  const username = cleanUsername(raw);
  const sellerId = parseSellerId(raw);

  if (!username && !sellerId) {
    return {
      title: "Store | QwikSale",
      description: "Browse a seller’s listings on QwikSale.",
    };
  }

  try {
    let user: MetaUserRow = null;

    if (username) {
      user = (await withTimeout<MetaUserRow>(
        prisma.user.findFirst({
          where: { username: { equals: username, mode: "insensitive" } },
          select: { id: true, username: true, name: true },
        }) as Promise<MetaUserRow>,
        600,
        null,
      )) as MetaUserRow;
    }

    if (!user && sellerId) {
      user = (await withTimeout<MetaUserRow>(
        prisma.user.findUnique({
          where: { id: sellerId },
          select: { id: true, username: true, name: true },
        }) as Promise<MetaUserRow>,
        600,
        null,
      )) as MetaUserRow;
    }

    if (user) {
      const handle = user.username ? `@${user.username}` : `u-${user.id}`;
      const display = user.name ? `${user.name} (${handle})` : handle;
      return {
        title: `${display} | Store | QwikSale`,
        description: `Browse listings from ${user.name || handle} on QwikSale.`,
      };
    }
  } catch {
    // ignore and fall through
  }

  const handle = username
    ? `@${username}`
    : sellerId
    ? `u-${sellerId}`
    : "store";
  return {
    title: `${handle} | Store | QwikSale`,
    description: `Browse listings from ${handle} on QwikSale.`,
  };
}

/* ----------------------------- types ----------------------------- */

type ApiListResp<T> = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: T[];
};

type StoreProduct = {
  id: string;
  name: string | null;
  image: string | null;
  price: number | null;
  featured: boolean | null;
  category: string | null;
  subcategory: string | null;
  createdAt?: string | null;

  /** Optional precomputed rating summary (from API if available). */
  ratingAverage?: number | null;
  ratingCount?: number | null;
};

type StoreService = StoreProduct;

type StoreUser = {
  id: string | null;
  name: string | null;
  username: string | null;
  image: string | null;
  city: string | null;
  country: string | null;
  createdAt: Date | null;
};

type DbStoreUser = {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
  city: string | null;
  country: string | null;
  createdAt: Date | null;
};

/* ----------------------------- Page ----------------------------- */

export default async function StorePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: raw } = await params;
  const slug = (raw ?? "").trim();
  const username = cleanUsername(slug);
  const sellerId = parseSellerId(slug);

  const userSelect = {
    id: true,
    name: true,
    username: true,
    image: true,
    city: true,
    country: true,
    createdAt: true,
  } as const;

  let realUser: StoreUser | null = null;

  if (username) {
    const dbUser = await withTimeout<DbStoreUser | null>(
      prisma.user.findFirst({
        where: { username: { equals: username, mode: "insensitive" } },
        select: userSelect,
      }) as Promise<DbStoreUser | null>,
      800,
      null,
    );
    if (dbUser) {
      realUser = dbUser;
    }
  }

  if (!realUser && sellerId) {
    const dbUser = await withTimeout<DbStoreUser | null>(
      prisma.user.findUnique({
        where: { id: sellerId },
        select: userSelect,
      }) as Promise<DbStoreUser | null>,
      800,
      null,
    );
    if (dbUser) {
      realUser = dbUser;
    }
  }

  const user: StoreUser =
    realUser || {
      id: null,
      name: null,
      username: username || (sellerId ? `u-${sellerId}` : "unknown"),
      image: null,
      city: null,
      country: null,
      createdAt: null,
    };

  const displayHandle =
    user.username || (realUser?.id ? `u-${realUser.id}` : "unknown");

  const userId = realUser?.id ?? null;
  const shouldFetchListings = Boolean(userId);

  const qs = shouldFetchListings
    ? `sellerId=${encodeURIComponent(userId!)}&pageSize=48&sort=newest`
    : null;

  let prodRes: Response | null = null;
  let svcRes: Response | null = null;

  if (shouldFetchListings && qs) {
    const tagUser = `user:${userId}:listings`;
    const tagStore = `store:${displayHandle}`;

    const prodUrl = makeApiUrl(`/api/products?${qs}`);
    const svcUrl = makeApiUrl(`/api/services?${qs}`);

    // IMPORTANT: fetch both in parallel and enforce a hard timeout
    // so that Store navigation never "hangs" waiting for upstreams.
    const [pRes, sRes] = await Promise.all([
      fetchWithTimeout(
        prodUrl,
        { next: { tags: ["products:latest", tagUser, tagStore] } },
        3000,
      ),
      fetchWithTimeout(
        svcUrl,
        { next: { tags: ["services:latest", tagUser, tagStore] } },
        3000,
      ),
    ]);

    prodRes = pRes;
    svcRes = sRes;
  }

  const prodOk = !!prodRes?.ok;
  const svcOk = !!svcRes?.ok;

  const productsJson: ApiListResp<StoreProduct> = prodOk
    ? await prodRes!
        .json()
        .catch(
          () =>
            ({
              page: 1,
              pageSize: 0,
              total: 0,
              totalPages: 1,
              items: [],
            }) as ApiListResp<StoreProduct>,
        )
    : {
        page: 1,
        pageSize: 0,
        total: 0,
        totalPages: 1,
        items: [],
      };

  const servicesJson: ApiListResp<StoreService> = svcOk
    ? await svcRes!
        .json()
        .catch(
          () =>
            ({
              page: 1,
              pageSize: 0,
              total: 0,
              totalPages: 1,
              items: [],
            }) as ApiListResp<StoreService>,
        )
    : {
        page: 1,
        pageSize: 0,
        total: 0,
        totalPages: 1,
        items: [],
      };

  const products = (productsJson.items || []).map((p) => ({
    ...p,
    category: p.category ?? null,
    subcategory: p.subcategory ?? null,
  }));

  const services = (servicesJson.items || []).map((s) => ({
    ...s,
    category: s.category ?? null,
    subcategory: s.subcategory ?? null,
  }));

  const totalProducts = Number(productsJson.total || 0);
  const totalServices = Number(servicesJson.total || 0);
  const totalListings = totalProducts + totalServices;
  const hasAny = totalListings > 0;

  const storeRating: RatingSummary = shouldFetchListings
    ? aggregateListingRatings(products, services)
    : { average: null, count: 0 };

  const memberSinceYear =
    user.createdAt instanceof Date
      ? user.createdAt.getFullYear()
      : user.createdAt
      ? new Date(user.createdAt).getFullYear()
      : null;

  const hasStoreRating =
    typeof storeRating.average === "number" && storeRating.count > 0;

  return (
    <main id="main" className="min-h-[60svh]">
      <section className="container mx-auto space-y-6 px-4 py-6">
        {/* Store header */}
        <div className="rounded-2xl bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] p-6 text-primary-foreground shadow-xl ring-1 ring-border/40">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="flex flex-1 items-center gap-4">
              <UserAvatar
                src={user.image}
                alt={`${displayHandle} avatar`}
                size={64}
                ring
                fallbackText={
                  (user.name || displayHandle || "U")
                    .slice(0, 1)
                    .toUpperCase()
                }
              />
              <div>
                <h1 className="text-2xl font-extrabold md:text-3xl">
                  Store: @{displayHandle}
                </h1>
                <p className="text-sm text-primary-foreground/90">
                  {user.name ? `${user.name}` : "Store profile"}
                  {memberSinceYear
                    ? ` • Member since ${memberSinceYear}`
                    : ""}
                  {user.city || user.country
                    ? ` • ${[user.city, user.country]
                        .filter(Boolean)
                        .join(", ")}`
                    : ""}
                </p>

                {/* Seller-level rating summary */}
                {userId && (
                  <div className="mt-2 flex items-center gap-3 text-xs">
                    <ReviewSummary
                      listingId={userId}
                      listingType="seller"
                      average={storeRating.average}
                      count={storeRating.count}
                      size="sm"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="mt-2 flex w-full flex-col items-end gap-2 md:mt-0 md:w-auto">
              {totalListings > 0 && (
                <div className="inline-flex items-center gap-3 rounded-full bg-background/20 px-4 py-2 text-xs font-medium text-primary-foreground/90">
                  <span>
                    {totalListings.toLocaleString()}{" "}
                    {totalListings === 1 ? "listing" : "listings"}
                  </span>
                  {totalProducts > 0 && (
                    <span className="inline-flex items-center rounded-full bg-background/30 px-2 py-0.5">
                      {totalProducts} products
                    </span>
                  )}
                  {totalServices > 0 && (
                    <span className="inline-flex items-center rounded-full bg-background/30 px-2 py-0.5">
                      {totalServices} services
                    </span>
                  )}
                </div>
              )}

              <Link
                href="/"
                className="rounded-full border border-border/60 bg-background/10 px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-background/20"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </div>

        {/* Soft warning instead of 500-style error */}
        {shouldFetchListings && (!prodOk || !svcOk) && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="font-semibold">Some listings couldn’t be loaded.</p>
            <p className="mt-1 opacity-80">
              {!prodOk && "Product listings are temporarily unavailable. "}
              {!svcOk && "Service listings are temporarily unavailable. "}
              Please try again later.
            </p>
          </div>
        )}

        {/* Empty state */}
        {!hasAny && (
          <div className="card-surface rounded-xl border border-border p-8 text-center text-muted-foreground">
            <p className="text-lg font-semibold">No listings yet</p>
            <p className="mt-1 text-sm opacity-80">
              {shouldFetchListings
                ? "This store hasn’t posted any products or services yet."
                : "This store profile isn’t set up yet."}
            </p>
            <div className="mt-4">
              <Link href="/" className="btn-outline">
                Browse Home
              </Link>
            </div>
          </div>
        )}

        {/* Products */}
        {totalProducts > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                Products
              </h2>
              <span className="text-sm text-muted-foreground">
                {totalProducts.toLocaleString()} items
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((p) => {
                const hasRating =
                  typeof p.ratingAverage === "number" &&
                  p.ratingAverage > 0 &&
                  typeof p.ratingCount === "number" &&
                  p.ratingCount > 0;

                return (
                  <Link
                    key={p.id}
                    href={`/product/${p.id}`}
                    className="group"
                    aria-label={p.name || "Product"}
                  >
                    <div
                      className="card-surface relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                      data-listing-id={p.id}
                      data-listing-kind="product"
                      {...(hasRating
                        ? {
                            "data-rating-avg": p.ratingAverage ?? undefined,
                            "data-rating-count": p.ratingCount ?? undefined,
                          }
                        : {})}
                    >
                      {p.featured && (
                        <span className="absolute left-2 top-2 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs font-semibold text-primary-foreground shadow">
                          Featured
                        </span>
                      )}
                      <div className="relative h-40 w-full bg-muted">
                        <SmartImage
                          src={p.image || undefined}
                          alt={p.name || "Product image"}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        />
                      </div>
                      <div className="p-4">
                        <h3 className="line-clamp-1 font-semibold text-foreground">
                          {p.name || "Unnamed item"}
                        </h3>
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          {[p.category, p.subcategory]
                            .filter(Boolean)
                            .join(" • ") || "—"}
                        </p>
                        <p className="mt-1 text-sm font-bold text-[#7dd3fc]">
                          {fmtKES(p.price)}
                        </p>

                        {hasRating && (
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <ReviewStars rating={p.ratingAverage || 0} />
                            <span className="font-medium">
                              {p.ratingAverage?.toFixed(1)}
                            </span>
                            <span className="text-[0.7rem] text-muted-foreground">
                              ({p.ratingCount})
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Services */}
        {totalServices > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                Services
              </h2>
              <span className="text-sm text-muted-foreground">
                {totalServices.toLocaleString()} items
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((s) => {
                const hasRating =
                  typeof s.ratingAverage === "number" &&
                  s.ratingAverage > 0 &&
                  typeof s.ratingCount === "number" &&
                  s.ratingCount > 0;

                return (
                  <Link
                    key={s.id}
                    href={`/service/${s.id}`}
                    className="group"
                    aria-label={s.name || "Service"}
                  >
                    <div
                      className="card-surface relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                      data-listing-id={s.id}
                      data-listing-kind="service"
                      {...(hasRating
                        ? {
                            "data-rating-avg": s.ratingAverage ?? undefined,
                            "data-rating-count": s.ratingCount ?? undefined,
                          }
                        : {})}
                    >
                      {s.featured && (
                        <span className="absolute left-2 top-2 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs font-semibold text-primary-foreground shadow">
                          Featured
                        </span>
                      )}
                      <div className="relative h-40 w-full bg-muted">
                        <SmartImage
                          src={s.image || undefined}
                          alt={s.name || "Service image"}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        />
                      </div>
                      <div className="p-4">
                        <h3 className="line-clamp-1 font-semibold text-foreground">
                          {s.name || "Unnamed service"}
                        </h3>
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          {[s.category, s.subcategory]
                            .filter(Boolean)
                            .join(" • ") || "—"}
                        </p>
                        <p className="mt-1 text-sm font-bold text-[#7dd3fc]">
                          {fmtServiceKES(s.price)}
                        </p>

                        {hasRating && (
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <ReviewStars rating={s.ratingAverage || 0} />
                            <span className="font-medium">
                              {s.ratingAverage?.toFixed(1)}
                            </span>
                            <span className="text-[0.7rem] text-muted-foreground">
                              ({s.ratingCount})
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
