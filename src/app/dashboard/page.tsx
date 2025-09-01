// src/app/dashboard/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "@/app/lib/auth"; // ⬅️ use wrapper (no args)
import { prisma } from "@/app/lib/prisma";

// Always evaluate per-request (session-sensitive)
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard — QwikSale",
  description: "Your QwikSale account overview, listings and actions.",
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
};

async function getUserIdOrNull() {
  const session = await getServerSession(); // ⬅️ no args
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
        <div className="mt-6">
          <Link
            href="/api/auth/signin"
            className="inline-block px-4 py-2 rounded-xl bg-black text-white"
          >
            Sign in with Google
          </Link>
        </div>
      </div>
    );
  }

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, subscription: true, image: true, createdAt: true },
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

  const [myListingsCount, favoritesCount, recentListingsRaw] = await Promise.all([
    prisma.product.count({ where: { sellerId: me.id } }),
    prisma.favorite.count({ where: { userId: me.id } }),
    prisma.product.findMany({
      where: { sellerId: me.id },
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
      },
    }),
  ]);

  const recentListings = recentListingsRaw as RecentListing[];

  // Subscription enum: BASIC (mapped from FREE), GOLD, PLATINUM
  const isBasic = me.subscription === "BASIC";

  // Pretty label
  const subLabel = me.subscription === "BASIC" ? "FREE" : me.subscription;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="rounded-2xl p-8 text-white shadow bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold">Welcome{me.name ? `, ${me.name}` : ""} 👋</h1>
            <p className="text-white/90">
              Manage your listings, favorites and subscription.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/15 px-3 py-1 text-sm">
              Subscription: <span className="font-semibold">{subLabel}</span>
            </span>
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
        <Link
          href="/sell"
          className="rounded-xl border px-4 py-2 font-semibold hover:bg-gray-50"
        >
          + Post a Listing
        </Link>
        <Link
          href="/saved"
          className="rounded-xl border px-4 py-2 font-semibold hover:bg-gray-50"
        >
          View Saved
        </Link>
        <Link
          href="/settings/billing"
          className="rounded-xl border px-4 py-2 font-semibold hover:bg-gray-50"
        >
          Billing & Subscription
        </Link>
        <Link
          href="/api/auth/signout"
          className="ml-auto rounded-xl border px-4 py-2 font-semibold hover:bg-gray-50"
        >
          Sign out
        </Link>
      </div>

      {/* Stats */}
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white p-5">
          <div className="text-sm text-gray-500">My Listings</div>
          <div className="text-2xl font-bold text-[#161748]">{myListingsCount}</div>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <div className="text-sm text-gray-500">Favorites</div>
          <div className="text-2xl font-bold text-[#161748]">{favoritesCount}</div>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <div className="text-sm text-gray-500">Member Since</div>
          <div className="text-2xl font-bold text-[#161748]">
            {new Date(me.createdAt).getFullYear()}
          </div>
        </div>
      </section>

      {/* Recent listings */}
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
            {recentListings.map((p: RecentListing) => (
              <Link
                key={p.id}
                href={`/product/${p.id}`}
                className="group"
              >
                <div className="relative bg-white rounded-xl shadow hover:shadow-lg transition overflow-hidden border border-gray-100">
                  {p.featured && (
                    <span className="absolute top-2 left-2 z-10 rounded-md bg-[#161748] text-white text-xs px-2 py-1 shadow">
                      Verified
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
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
