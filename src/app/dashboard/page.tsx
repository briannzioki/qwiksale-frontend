// src/app/dashboard/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Dashboard — QwikSale",
  description: "Your QwikSale account overview, listings and insights.",
};

type RecentListing = {
  id: string;
  name: string;
  image: string | null;
  createdAt: Date;
  price: number | null;
  featured: boolean;
  category: string;
  subcategory: string;
  status: "ACTIVE" | "SOLD" | "HIDDEN" | "DRAFT";
};

async function getUserIdOrNull() {
  const session = await getServerSession();
  const id = (session?.user as any)?.id as string | undefined;
  const email = session?.user?.email || undefined;

  if (!session?.user) return { session, userId: null };
  if (id) return { session, userId: id };

  if (email) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    return { session, userId: user?.id ?? null };
  }

  return { session, userId: null };
}

export default async function DashboardPage() {
  const { session, userId } = await getUserIdOrNull();

  if (!session || !userId) {
    return (
      <div className="p-6">
        <div className="rounded-2xl p-8 text-white shadow bg-gradient-to-r from-[#39a0ca] via-[#478559] to-[#161748]">
          <h1 className="text-2xl md:text-3xl font-extrabold">Dashboard</h1>
          <p className="text-white/90">You need to sign in to view this page.</p>
        </div>
        <div className="mt-6 flex gap-3">
          <Link href="/api/auth/signin" className="inline-block px-4 py-2 rounded-xl bg-black text-white">
            Sign in with Google
          </Link>
          <Link href="/signin" className="inline-block px-4 py-2 rounded-xl border">
            Sign in with email
          </Link>
        </div>
      </div>
    );
  }

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, subscription: true, image: true, createdAt: true, username: true },
  });

  if (!me) {
    return (
      <div className="p-6">
        <p className="mb-3">We couldn’t load your account. Please sign in again.</p>
        <Link href="/api/auth/signin" className="text-blue-600 underline">
          Sign in
        </Link>
      </div>
    );
  }

  // Data for metrics
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    myListingsCount,
    favoritesCount,
    recentListingsRaw,
    newLast7Days,
    likesOnMyListings,
    topCats30,
  ] = await Promise.all([
    // Show ALL your listings count (not just ACTIVE)
    prisma.product.count({ where: { sellerId: me.id } }),
    prisma.favorite.count({ where: { userId: me.id } }),
    prisma.product.findMany({
      where: { sellerId: me.id }, // all statuses so you can edit drafts/hidden
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        name: true,
        image: true,
        createdAt: true,
        price: true,
        featured: true,
        category: true,
        subcategory: true,
        status: true, // ← show status badge
      },
    }),
    prisma.product.count({ where: { sellerId: me.id, createdAt: { gte: since7d } } }),
    prisma.favorite.count({ where: { product: { sellerId: me.id } } }),
    // Market snapshot should only consider ACTIVE (publicly visible) items
    prisma.product.groupBy({
      by: ["category"],
      where: { status: "ACTIVE", createdAt: { gte: since30d } },
      _count: { category: true },
    }),
  ]);

  const topCategoriesSorted = [...topCats30]
    .sort((a, b) => (b._count.category ?? 0) - (a._count.category ?? 0))
    .slice(0, 5);

  const recentListings = recentListingsRaw as unknown as RecentListing[];
  const isBasic = me.subscription === "BASIC";
  const subLabel = me.subscription === "BASIC" ? "FREE" : me.subscription;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="rounded-2xl p-6 text-white shadow bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold">
              Welcome{me.name ? `, ${me.name}` : ""} 👋
            </h1>
            <p className="text-white/90">
              Manage your listings, favorites and account.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/15 px-3 py-1 text-sm">
              Subscription: <span className="font-semibold">{subLabel}</span>
            </span>
            <Link
              href="/account/profile"
              className="rounded-xl bg-white text-[#161748] px-4 py-2 text-sm font-semibold hover:bg-white/90"
              title="Edit account"
            >
              Edit Account
            </Link>
            {isBasic && (
              <Link
                href="/settings/billing"
                className="rounded-xl bg-white text-[#161748] px-4 py-2 text-sm font-semibold hover:bg-white/90"
              >
                Upgrade
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Link href="/sell" className="rounded-xl border px-4 py-2 font-semibold hover:bg-gray-50">
          + Post a Listing
        </Link>
        <Link href="/saved" className="rounded-xl border px-4 py-2 font-semibold hover:bg-gray-50">
          View Saved
        </Link>
        <Link href="/settings/billing" className="rounded-xl border px-4 py-2 font-semibold hover:bg-gray-50">
          Billing & Subscription
        </Link>
        <Link href="/api/auth/signout" className="ml-auto rounded-xl border px-4 py-2 font-semibold hover:bg-gray-50">
          Sign out
        </Link>
      </div>

      {/* Stats */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Metric title="My Listings" value={myListingsCount} />
        <Metric title="My Favorites" value={favoritesCount} />
        <Metric title="New in last 7 days" value={newLast7Days} />
        <Metric title="Likes on my listings" value={likesOnMyListings} />
      </section>

      {/* Trends */}
      <section className="rounded-xl border bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Market snapshot (last 30 days)</h2>
          <Link href="/" className="text-sm text-[#39a0ca] underline">Explore market →</Link>
        </div>
        {topCategoriesSorted.length === 0 ? (
          <div className="text-gray-600">No data yet.</div>
        ) : (
          <ul className="text-sm text-gray-800 grid sm:grid-cols-2 lg:grid-cols-3 gap-1">
            {topCategoriesSorted.map((c) => (
              <li key={c.category} className="flex items-center justify-between border-b py-1">
                <span>{c.category}</span>
                <span className="text-gray-500">{c._count.category}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Social links prompt */}
      <section className="rounded-xl border bg-white p-5">
        <h2 className="text-lg font-semibold mb-1">Boost your store</h2>
        <p className="text-sm text-gray-600 mb-3">
          Add your social links so buyers can trust your brand.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/account/profile#socials" className="rounded-xl border px-4 py-2 hover:bg-gray-50">
            Add social links
          </Link>
          {me.username && (
            <Link href={`/store/${me.username}`} className="rounded-xl border px-4 py-2 hover:bg-gray-50">
              View my store
            </Link>
          )}
        </div>
      </section>

      {/* Recent listings with actions */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your Recent Listings</h2>
          <Link href="/sell" className="text-sm text-[#39a0ca] underline">
            Post another →
          </Link>
        </div>

        {recentListings.length === 0 ? (
          <div className="text-gray-600">No listings yet. Get started by posting your first item.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentListings.map((p) => (
              <div key={p.id} className="group">
                <div className="relative bg-white rounded-xl shadow hover:shadow-lg transition overflow-hidden border border-gray-100">
                  {p.featured && (
                    <span className="absolute top-2 left-2 z-10 rounded-md bg-[#161748] text-white text-xs px-2 py-1 shadow">
                      Verified
                    </span>
                  )}
                  {/* Status badge (only when not ACTIVE) */}
                  {p.status !== "ACTIVE" && (
                    <span className="absolute top-2 right-2 z-10 rounded-md bg-gray-800 text-white text-xs px-2 py-1 shadow">
                      {p.status}
                    </span>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.image || "/placeholder/default.jpg"}
                    alt={p.name}
                    className="w-full h-40 object-cover"
                  />
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 line-clamp-1">{p.name}</h3>
                    <p className="text-xs text-gray-500 line-clamp-1">
                      {p.category} • {p.subcategory}
                    </p>
                    <p className="text-[#161748] font-bold mt-1">
                      {typeof p.price === "number" && p.price > 0
                        ? `KES ${p.price.toLocaleString()}`
                        : "Contact for price"}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </p>

                    {/* Actions */}
                    <div className="mt-3 flex gap-2">
                      <Link
                        href={`/product/${p.id}`}
                        className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
                      >
                        View
                      </Link>
                      <Link
                        href={`/sell?id=${p.id}`}
                        className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
                        title="Edit listing"
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/product/${p.id}#delete`}
                        className="rounded-md border px-3 py-1 text-sm text-red-600 hover:bg-red-50"
                        title="Delete listing"
                      >
                        Delete
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-xl border bg-white p-5">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-2xl font-bold text-[#161748]">{value}</div>
    </div>
  );
}
