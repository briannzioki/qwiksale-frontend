// src/app/store/[username]/page.tsx
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
            } as ApiListResp<StoreProduct>),
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
            } as ApiListResp<StoreService>),
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

  const hasAny =
    Number(productsJson.total || 0) + Number(servicesJson.total || 0) > 0;

  return (
    <div className="space-y-6">
      {/* Store header */}
      <div className="rounded-2xl bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] p-6 text-white shadow">
        <div className="flex items-center gap-4">
          <UserAvatar
            src={user.image}
            alt={`${displayHandle} avatar`}
            size={56}
            ring
            fallbackText={
              (user.name || displayHandle || "U").slice(0, 1).toUpperCase()
            }
          />
          <div>
            <h1 className="text-2xl font-extrabold md:text-3xl">
              Store: @{displayHandle}
            </h1>
            <p className="text-sm text-white/90">
              {user.name ? `${user.name} • ` : ""}
              {user.createdAt
                ? `Member since ${new Date(user.createdAt).getFullYear()}`
                : "Store profile"}
              {user.city || user.country
                ? ` • ${[user.city, user.country].filter(Boolean).join(", ")}`
                : ""}
            </p>
          </div>
          <div className="ml-auto">
            <Link href="/" className="btn-outline">
              Back to Home
            </Link>
          </div>
        </div>
      </div>

      {/* Soft warning instead of 500-style error */}
      {shouldFetchListings && (!prodOk || !svcOk) && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <p className="font-semibold">Some listings couldn’t be loaded.</p>
          <p className="text-sm opacity-80">
            {!prodOk && "Product listings are temporarily unavailable. "}
            {!svcOk && "Service listings are temporarily unavailable. "}
            Please try again later.
          </p>
        </div>
      )}

      {/* Empty state */}
      {!hasAny && (
        <div className="rounded-xl border p-8 text-center text-gray-600 dark:border-slate-800 dark:text-slate-300">
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
      {productsJson.total > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Products</h2>
            <span className="text-sm text-gray-500">
              {productsJson.total} items
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <Link key={p.id} href={`/product/${p.id}`} className="group">
                <div className="relative overflow-hidden rounded-xl border border-gray-100 bg-white shadow transition hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
                  {p.featured && (
                    <span className="absolute left-2 top-2 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs text-white shadow">
                      Featured
                    </span>
                  )}
                  <div className="relative h-40 w-full bg-gray-100 dark:bg-slate-800">
                    <SmartImage
                      src={p.image || undefined}
                      alt={p.name || "Product image"}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="line-clamp-1 font-semibold text-gray-900 dark:text-white">
                      {p.name || "Unnamed item"}
                    </h3>
                    <p className="line-clamp-1 text-xs text-gray-500 dark:text-slate-400">
                      {[p.category, p.subcategory].filter(Boolean).join(" • ") || "—"}
                    </p>
                    <p className="mt-1 font-bold text-[#161748] dark:text-brandBlue">
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
      {servicesJson.total > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Services</h2>
            <span className="text-sm text-gray-500">
              {servicesJson.total} items
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <Link key={s.id} href={`/service/${s.id}`} className="group">
                <div className="relative overflow-hidden rounded-xl border border-gray-100 bg-white shadow transition hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
                  {s.featured && (
                    <span className="absolute left-2 top-2 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs text-white shadow">
                      Featured
                    </span>
                  )}
                  <div className="relative h-40 w-full bg-gray-100 dark:bg-slate-800">
                    <SmartImage
                      src={s.image || undefined}
                      alt={s.name || "Service image"}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="line-clamp-1 font-semibold text-gray-900 dark:text-white">
                      {s.name || "Unnamed service"}
                    </h3>
                    <p className="line-clamp-1 text-xs text-gray-500 dark:text-slate-400">
                      {[s.category, s.subcategory].filter(Boolean).join(" • ") || "—"}
                    </p>
                    <p className="mt-1 font-bold text-[#161748] dark:text-brandBlue">
                      {fmtKES(s.price)}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
