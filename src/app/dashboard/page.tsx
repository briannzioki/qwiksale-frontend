// src/app/dashboard/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import DeleteListingButton from "./DeleteListingButton";
import UserAvatar from "@/app/components/UserAvatar";

/** Page metadata */
export const metadata: Metadata = {
  title: "Dashboard · QwikSale",
  description: "Your QwikSale account overview, listings, and insights.",
  robots: { index: false, follow: false },
};

/* -------------------------------- types -------------------------------- */
type Status = "ACTIVE" | "SOLD" | "HIDDEN" | "DRAFT";

type ApiListResp<T> = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: T[];
};

type ProductItem = {
  id: string;
  name: string;
  image: string | null;
  createdAt?: string | null;
  price: number | null;
  featured: boolean | null;
  category: string | null;
  subcategory: string | null;
  status?: Status | null;
};

type ServiceItem = {
  id: string;
  name: string;
  image: string | null;
  createdAt?: string | null;
  price: number | null;
  featured: boolean | null;
  category: string | null;
  subcategory: string | null;
  status?: Status | null;
};

type RecentListing =
  | (ProductItem & { type: "product" })
  | (ServiceItem & { type: "service" });

type TopCat = {
  category: string | null;
  _count: { category: number };
};

/* -------------------------------- utils -------------------------------- */
function fmtKES(n?: number | null) {
  if (!n || n <= 0) return "Contact for price";
  try {
    return `KES ${new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

async function getUserId(): Promise<string | null> {
  try {
    const session = await auth();
    const fromToken = (session?.user as any)?.id as string | undefined;
    if (fromToken) return fromToken;

    // Fallback by email if token shape changes
    const email = session?.user?.email ?? null;
    if (!email) return null;
    const u = await prisma.user
      .findUnique({ where: { email }, select: { id: true } })
      .catch(() => null);
    return u?.id ?? null;
  } catch {
    return null;
  }
}

// Some deployments name the model Service/Services; be flexible.
function getServiceModel() {
  const anyPrisma = prisma as any;
  return (
    anyPrisma.service ??
    anyPrisma.services ??
    anyPrisma.Service ??
    anyPrisma.Services ??
    null
  );
}

/* -------------------------------- page -------------------------------- */
export default async function DashboardPage() {
  const userId = await getUserId();

  if (!userId) {
    return (
      <div className="p-6 space-y-6">
        <div className="rounded-2xl p-8 text-white shadow bg-gradient-to-r from-[#39a0ca] via-[#478559] to-[#161748]">
          <h1 className="text-2xl md:text-3xl font-extrabold">Dashboard</h1>
          <p className="text-white/90">You need to sign in to view this page.</p>
        </div>
        <div className="mt-2 flex flex-wrap gap-3">
          <Link href="/signin?callbackUrl=%2Fdashboard" className="btn-gradient-primary">
            Sign in with email
          </Link>
          <Link href="/api/auth/signin/google?callbackUrl=%2Fdashboard" className="btn-outline">
            Continue with Google
          </Link>
        </div>
      </div>
    );
  }

  const now = Date.now();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const Service = getServiceModel();

  // Counts & aggregates (each guarded to avoid crashing the page)
  const [
    me,
    productCount,
    serviceCount,
    favoritesCount, // favorites on products (legacy)
    newProductsLast7,
    newServicesLast7,
    likesOnMyListings, // likes on my products
    topCats30Raw,
  ] = await Promise.all([
    prisma.user
      .findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          subscription: true,
          image: true,
          createdAt: true,
          username: true,
        },
      })
      .catch(() => null),

    prisma.product.count({ where: { sellerId: userId } }).catch(() => 0),
    (Service ? Service.count({ where: { sellerId: userId } }).catch(() => 0) : Promise.resolve(0)),

    prisma.favorite.count({ where: { userId } }).catch(() => 0),

    prisma.product
      .count({ where: { sellerId: userId, createdAt: { gte: since7d } } })
      .catch(() => 0),
    (Service
      ? Service.count({ where: { sellerId: userId, createdAt: { gte: since7d } } }).catch(() => 0)
      : Promise.resolve(0)),

    prisma.favorite.count({ where: { product: { sellerId: userId } } }).catch(() => 0),

    prisma.product
      .groupBy({
        by: ["category"],
        where: { status: "ACTIVE", createdAt: { gte: since30d } },
        _count: { category: true },
      })
      .catch(() => [] as TopCat[]),
  ]);

  if (!me) {
    return (
      <div className="p-6">
        <p className="mb-3">We couldn’t load your account. Please sign in again.</p>
        <Link href="/signin?callbackUrl=%2Fdashboard" className="text-[#39a0ca] underline">
          Sign in
        </Link>
      </div>
    );
  }

  // Fetch recent items via API (per-user & no-store to avoid cross-user cache)
  const qs = `sellerId=${encodeURIComponent(userId)}&pageSize=6&sort=newest`;
  const [prodRes, svcRes] = await Promise.all([
    fetch(`/api/products?${qs}`, {
      cache: "no-store",
      next: { tags: ["products", `user:${userId}:products`, "dashboard"] },
    }),
    fetch(`/api/services?${qs}`, {
      cache: "no-store",
      next: { tags: ["services", `user:${userId}:services`, "dashboard"] },
    }),
  ]);

  const productsJson: ApiListResp<ProductItem> = prodRes.ok
    ? await prodRes.json().catch(() => ({ page: 1, pageSize: 0, total: 0, totalPages: 1, items: [] }))
    : { page: 1, pageSize: 0, total: 0, totalPages: 1, items: [] };

  const servicesJson: ApiListResp<ServiceItem> = svcRes.ok
    ? await svcRes.json().catch(() => ({ page: 1, pageSize: 0, total: 0, totalPages: 1, items: [] }))
    : { page: 1, pageSize: 0, total: 0, totalPages: 1, items: [] };

  const products = (productsJson.items || []).map<RecentListing>((p) => ({
    ...p,
    type: "product",
    category: p.category ?? null,
    subcategory: p.subcategory ?? null,
  }));

  const services = (servicesJson.items || []).map<RecentListing>((s) => ({
    ...s,
    type: "service",
    category: s.category ?? null,
    subcategory: s.subcategory ?? null,
  }));

  // Merge & sort by createdAt desc (fallback to id for tie-breaker)
  const recentListings = [...products, ...services]
    .sort((a, b) => {
      const at = Date.parse(a.createdAt || "") || 0;
      const bt = Date.parse(b.createdAt || "") || 0;
      if (bt !== at) return bt - at;
      return String(b.id).localeCompare(String(a.id));
    })
    .slice(0, 6);

  const topCats30 = (topCats30Raw as TopCat[])
    .filter((x) => !!x.category)
    .sort((a, b) => (b._count?.category ?? 0) - (a._count?.category ?? 0))
    .slice(0, 5);

  const subLabel = me.subscription === "BASIC" ? "FREE" : me.subscription ?? "FREE";
  const myListingsCount = (productCount ?? 0) + (serviceCount ?? 0);
  const newLast7Days = (newProductsLast7 ?? 0) + (newServicesLast7 ?? 0);

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-2xl p-6 text-white shadow bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <UserAvatar src={me.image} alt={me.name || me.email || "You"} size={40} />
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold">
                Welcome{me.name ? `, ${me.name}` : ""} 👋
              </h1>
              <p className="text-white/90">Manage your listings, favorites, and account.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/15 px-3 py-1 text-sm">
              Subscription: <span className="font-semibold">{subLabel}</span>
            </span>
            <Link href="/account/profile" className="btn-gradient-primary text-sm" title="Edit account">
              Edit Account
            </Link>
            {subLabel === "FREE" && (
              <Link href="/settings/billing" className="btn-gradient-accent text-sm">
                Upgrade
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/sell" className="btn-outline">
          + Post a Listing
        </Link>
        <Link href="/saved" className="btn-outline">
          View Saved
        </Link>
        <Link href="/settings/billing" className="btn-outline">
          Billing & Subscription
        </Link>
        {/* Server page: use the NextAuth signout route (GET renders a confirm) */}
        <Link href="/api/auth/signout" className="ml-auto btn-outline">
          Sign out
        </Link>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric title="My Listings" value={myListingsCount} />
        <Metric title="My Favorites" value={favoritesCount ?? 0} />
        <Metric title="New in last 7 days" value={newLast7Days} />
        <Metric title="Likes on my listings" value={likesOnMyListings ?? 0} />
      </section>

      <section className="rounded-xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Market snapshot (last 30 days)</h2>
          <Link href="/search" className="text-sm text-[#39a0ca] underline">
            Explore market →
          </Link>
        </div>
        {topCats30.length === 0 ? (
          <div className="text-gray-600 dark:text-slate-300">No data yet.</div>
        ) : (
          <ul className="grid gap-1 text-sm text-gray-800 dark:text-slate-100 sm:grid-cols-2 lg:grid-cols-3">
            {topCats30.map((c) => (
              <li
                key={c.category ?? "uncategorized"}
                className="flex items-center justify-between border-b py-1 dark:border-slate-800"
              >
                <span>{c.category ?? "Uncategorized"}</span>
                <span className="text-gray-500 dark:text-slate-400">
                  {c._count.category ?? 0}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your Recent Listings</h2>
          <Link href="/sell" className="text-sm text-[#39a0ca] underline">
            Post another →
          </Link>
        </div>

        {recentListings.length === 0 ? (
          <div className="text-gray-600 dark:text-slate-300">
            No listings yet. Post your first item.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentListings.map((item) => {
              const hrefView =
                item.type === "product" ? `/product/${item.id}` : `/service/${item.id}`;
              const hrefEdit =
                item.type === "product" ? `/product/${item.id}/edit` : `/service/${item.id}/edit`;
              return (
                <div key={`${item.type}-${item.id}`} className="group">
                  <div className="relative overflow-hidden rounded-xl border border-gray-100 bg-white shadow transition hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
                    {item.featured ? (
                      <span className="absolute left-2 top-2 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs text-white shadow">
                        Featured
                      </span>
                    ) : null}
                    {item.status && item.status !== "ACTIVE" ? (
                      <span className="absolute right-2 top-2 z-10 rounded-md bg-gray-800 px-2 py-1 text-xs text-white shadow">
                        {item.status}
                      </span>
                    ) : null}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.image || "/placeholder/default.jpg"}
                      alt={item.name}
                      className="h-40 w-full object-cover"
                    />
                    <div className="p-4">
                      <h3 className="line-clamp-1 font-semibold text-gray-900 dark:text-white">
                        {item.name || (item.type === "product" ? "Unnamed item" : "Unnamed service")}
                      </h3>
                      <p className="line-clamp-1 text-xs text-gray-500 dark:text-slate-400">
                        {[item.category, item.subcategory].filter(Boolean).join(" • ") || "—"}
                      </p>
                      <p className="mt-1 font-bold text-[#161748] dark:text-white">{fmtKES(item.price)}</p>
                      <p className="mt-1 text-[11px] text-gray-400">
                        {item.createdAt
                          ? new Date(item.createdAt).toLocaleDateString("en-KE")
                          : ""}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Link
                          href={hrefView}
                          className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-800"
                        >
                          View
                        </Link>
                        <Link
                          href={hrefEdit}
                          className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-800"
                          title="Edit listing"
                        >
                          Edit
                        </Link>
                        {item.type === "product" ? (
                          <DeleteListingButton productId={item.id} productName={item.name} />
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: number }) {
  const safe = Number.isFinite(value) ? value : 0;
  return (
    <div className="rounded-xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-sm text-gray-500 dark:text-slate-400">{title}</div>
      <div className="text-2xl font-bold text-[#161748] dark:text-white">
        {new Intl.NumberFormat("en-KE").format(safe)}
      </div>
    </div>
  );
}
