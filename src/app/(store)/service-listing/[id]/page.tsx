// src/app/(store)/service-listing/[id]/page.tsx
export const revalidate = 300;
export const runtime = "nodejs";

import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/app/lib/prisma";
import UserAvatar from "@/app/components/UserAvatar";
import SmartImage from "@/app/components/SmartImage";
import { makeApiUrl } from "@/app/lib/url";

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

function fmtMemberSince(d: Date | null): string | null {
  if (!d) return null;
  try {
    return new Intl.DateTimeFormat("en-KE", {
      month: "short",
      year: "numeric",
      timeZone: "Africa/Nairobi",
    }).format(d);
  } catch {
    return String(d.getFullYear());
  }
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
      user = await withTimeout<MetaUserRow>(
        prisma.user.findFirst({
          where: { username: { equals: username, mode: "insensitive" } },
          select: { id: true, username: true, name: true },
        }) as Promise<MetaUserRow>,
        600,
        null,
      );
    }

    if (!user && sellerId) {
      user = await withTimeout<MetaUserRow>(
        prisma.user.findUnique({
          where: { id: sellerId },
          select: { id: true, username: true, name: true },
        }) as Promise<MetaUserRow>,
        600,
        null,
      );
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

    prodRes = await fetch(makeApiUrl(`/api/products?${qs}`), {
      next: { tags: ["products:latest", tagUser, tagStore] },
    }).catch(() => null as any);

    svcRes = await fetch(makeApiUrl(`/api/services?${qs}`), {
      next: { tags: ["services:latest", tagUser, tagStore] },
    }).catch(() => null as any);
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

  const totalProducts =
    Number.isFinite(productsJson.total) && productsJson.total > 0
      ? productsJson.total
      : products.length;
  const totalServices =
    Number.isFinite(servicesJson.total) && servicesJson.total > 0
      ? servicesJson.total
      : services.length;
  const totalListings = totalProducts + totalServices;

  const hasAny = totalListings > 0;
  const hasProducts = totalProducts > 0;
  const hasServices = totalServices > 0;

  const softError =
    shouldFetchListings && (!prodOk || !svcOk)
      ? !prodOk && !svcOk
        ? "Listings are temporarily unavailable."
        : !prodOk
        ? "Product listings are temporarily unavailable."
        : "Service listings are temporarily unavailable."
      : null;

  const memberSince = user.createdAt
    ? fmtMemberSince(
        user.createdAt instanceof Date
          ? user.createdAt
          : new Date(user.createdAt),
      )
    : null;

  const locationText = [user.city, user.country].filter(Boolean).join(", ");

  const categoryCounts = new Map<string, number>();
  for (const item of [...products, ...services]) {
    const key =
      [item.category, item.subcategory].filter(Boolean).join(" · ") || "";
    if (!key) continue;
    categoryCounts.set(key, (categoryCounts.get(key) ?? 0) + 1);
  }
  const topCategories = Array.from(categoryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div className="space-y-8">
      {/* Store hero */}
      <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue px-6 py-6 shadow-lg sm:px-8 sm:py-7">
        <div className="absolute inset-0 opacity-30 mix-blend-soft-light">
          <div className="h-full w-full bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.9),transparent_60%)]" />
        </div>

        <div className="relative flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-4">
            <UserAvatar
              src={user.image}
              alt={`${displayHandle} avatar`}
              size={64}
              ring
              fallbackText={
                (user.name || displayHandle || "U").slice(0, 1).toUpperCase()
              }
            />
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-white/70">
                Store
              </p>
              <h1 className="text-2xl font-extrabold leading-tight text-white md:text-3xl">
                @{displayHandle}
              </h1>
              <p className="mt-1 text-sm text-white/90">
                {user.name ? `${user.name}` : "QwikSale seller"}
                {memberSince ? ` • Member since ${memberSince}` : ""}
                {locationText ? ` • ${locationText}` : ""}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3 md:ml-auto md:mt-0">
            <Link
              href="/search"
              className="btn-outline border-white/30 bg-white/5 text-sm text-white hover:bg-white/10"
              prefetch={false}
            >
              Browse marketplace
            </Link>
            <Link
              href="/"
              className="btn-gradient-primary bg-white/90 text-xs font-semibold text-[#161748] shadow-lg hover:bg-white"
              prefetch={false}
            >
              Back to Home
            </Link>
          </div>
        </div>

        <div className="relative mt-4 flex flex-wrap gap-3 text-xs text-white/90">
          <span className="inline-flex items-center rounded-full bg-black/25 px-3 py-1">
            {totalListings > 0
              ? `${totalListings.toLocaleString()} active listing${
                  totalListings === 1 ? "" : "s"
                }`
              : "No listings yet"}
          </span>
          <span className="inline-flex items-center rounded-full bg-black/20 px-3 py-1">
            {totalProducts.toLocaleString()} product
            {totalProducts === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center rounded-full bg-black/20 px-3 py-1">
            {totalServices.toLocaleString()} service
            {totalServices === 1 ? "" : "s"}
          </span>
          {locationText && (
            <span className="inline-flex items-center rounded-full bg-black/15 px-3 py-1">
              Based in {locationText}
            </span>
          )}
        </div>
      </section>

      {/* Soft warning */}
      {softError && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-semibold">Some listings couldn’t be loaded.</p>
          <p className="mt-1 opacity-80">{softError} Please try again later.</p>
        </div>
      )}

      {/* Main + aside layout */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:grid-cols-[minmax(0,5fr)_minmax(0,2.6fr)]">
        <main className="space-y-8">
          {/* Empty state */}
          {!hasAny && (
            <section className="rounded-2xl border border-dashed border-border bg-muted p-8 text-center text-sm text-foreground">
              <p className="text-lg font-semibold">No listings yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {shouldFetchListings
                  ? "This store hasn’t posted any products or services yet."
                  : "This store profile isn’t set up yet."}
              </p>
              <div className="mt-4 flex justify-center gap-3">
                <Link href="/" className="btn-outline" prefetch={false}>
                  Browse Home
                </Link>
                <Link
                  href="/sell"
                  className="btn-gradient-primary"
                  prefetch={false}
                >
                  Sell something
                </Link>
              </div>
            </section>
          )}

          {/* Products */}
          {hasProducts && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-foreground md:text-lg">
                  Products
                </h2>
                <span className="text-xs text-muted-foreground">
                  {totalProducts.toLocaleString()} item
                  {totalProducts === 1 ? "" : "s"}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((p) => (
                  <Link key={p.id} href={`/product/${p.id}`} className="group">
                    <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                      {p.featured && (
                        <span className="absolute left-2 top-2 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs text-white shadow">
                          Featured
                        </span>
                      )}
                      <div className="relative h-44 w-full bg-muted">
                        <SmartImage
                          src={p.image || undefined}
                          alt={p.name || "Product image"}
                          fill
                          className="object-cover transition group-hover:scale-[1.03]"
                          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        />
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        <h3 className="line-clamp-1 font-semibold text-foreground">
                          {p.name || "Unnamed item"}
                        </h3>
                        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                          {[p.category, p.subcategory]
                            .filter(Boolean)
                            .join(" • ") || "—"}
                        </p>
                        <p className="mt-2 text-sm font-bold text-[#161748] dark:text-brandBlue">
                          {fmtKES(p.price)}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Services */}
          {hasServices && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-foreground md:text-lg">
                  Services
                </h2>
                <span className="text-xs text-muted-foreground">
                  {totalServices.toLocaleString()} item
                  {totalServices === 1 ? "" : "s"}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {services.map((s) => (
                  <Link key={s.id} href={`/service/${s.id}`} className="group">
                    <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                      {s.featured && (
                        <span className="absolute left-2 top-2 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs text-white shadow">
                          Featured
                        </span>
                      )}
                      <div className="relative h-44 w-full bg-muted">
                        <SmartImage
                          src={s.image || undefined}
                          alt={s.name || "Service image"}
                          fill
                          className="object-cover transition group-hover:scale-[1.03]"
                          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        />
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        <h3 className="line-clamp-1 font-semibold text-foreground">
                          {s.name || "Unnamed service"}
                        </h3>
                        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                          {[s.category, s.subcategory]
                            .filter(Boolean)
                            .join(" • ") || "—"}
                        </p>
                        <p className="mt-2 text-sm font-bold text-[#161748] dark:text-brandBlue">
                          {fmtKES(s.price)}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </main>

        {/* Right-hand “flood” / context column */}
        <aside className="space-y-4">
          <section className="rounded-2xl border border-border bg-muted p-5 text-sm text-foreground">
            <h2 className="text-sm font-semibold tracking-tight">
              Store overview
            </h2>
            <p className="mt-2 text-xs text-muted-foreground">
              See everything this seller offers in one place. Use the main
              marketplace search if you want to cross-shop similar items.
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-muted-foreground">Total listings</dt>
                <dd className="mt-1 text-base font-semibold">
                  {totalListings.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Products</dt>
                <dd className="mt-1 text-base font-semibold">
                  {totalProducts.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Services</dt>
                <dd className="mt-1 text-base font-semibold">
                  {totalServices.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Member since</dt>
                <dd className="mt-1 text-sm font-semibold">
                  {memberSince ?? "—"}
                </dd>
              </div>
            </dl>
          </section>

          {topCategories.length > 0 && (
            <section className="rounded-2xl border border-border bg-muted p-5 text-sm text-foreground">
              <h2 className="text-sm font-semibold tracking-tight">
                Popular in this store
              </h2>
              <p className="mt-2 text-xs text-muted-foreground">
                Quick snapshot of what this seller lists the most.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {topCategories.map(([label, count]) => (
                  <span
                    key={label}
                    className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-[11px] text-foreground"
                  >
                    {label}
                    <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {count}
                    </span>
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-border bg-muted p-5 text-xs text-muted-foreground">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Buyer tips
            </h2>
            <ul className="mt-2 space-y-1.5">
              <li>• Meet in safe, public places for high-value items.</li>
              <li>• Confirm details and condition before sending money.</li>
              <li>• Use Mpesa messages and receipts to track payments.</li>
              <li>• Report suspicious listings from the listing page.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
