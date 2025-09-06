// src/app/dashboard/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import DeleteListingButton from "./DeleteListingButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Dashboard · QwikSale",
  description: "Your QwikSale account overview, listings, and insights.",
};

type RecentListing = {
  id: string;
  name: string;
  image: string | null;
  createdAt: Date;
  price: number | null;
  featured: boolean | null;
  category: string;
  subcategory: string;
  status: "ACTIVE" | "SOLD" | "HIDDEN" | "DRAFT";
};

function fmtKES(n?: number | null) {
  if (!n || n <= 0) return "Contact for price";
  try {
    return `KES ${new Intl.NumberFormat("en-KE").format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

async function getUserId(): Promise<string | null> {
  const session = await auth();
  const fromToken = (session?.user as any)?.id as string | undefined;
  if (fromToken) return fromToken ?? null;

  const email = session?.user?.email ?? null;
  if (!email) return null;

  const u = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  return u?.id ?? null;
}

export default async function DashboardPage() {
  const userId = await getUserId();

  /* ----------------------------- Signed out state ---------------------------- */
  if (!userId) {
    return (
      <div className="p-6 space-y-6">
        <div className="rounded-2xl p-8 text-white shadow bg-gradient-to-r from-[#39a0ca] via-[#478559] to-[#161748]">
          <h1 className="text-2xl md:text-3xl font-extrabold">Dashboard</h1>
          <p className="text-white/90">You need to sign in to view this page.</p>
        </div>

        <div className="mt-2 flex flex-wrap gap-3">
          <Link
            href="/signin?callbackUrl=%2Fdashboard"
            className="inline-flex items-center rounded-xl bg-black px-4 py-2 font-semibold text-white hover:opacity-90"
          >
            Sign in with email
          </Link>
          <Link
            href="/api/auth/signin/google?callbackUrl=%2Fdashboard"
            className="inline-flex items-center rounded-xl border px-4 py-2 font-semibold hover:bg-gray-50"
          >
            Continue with Google
          </Link>
        </div>
      </div>
    );
  }

  /* --------------------------------- Queries -------------------------------- */
  const now = Date.now();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [{ me, myListingsCount, favoritesCount, newLast7Days, likesOnMyListings, topCats30, recentListingsRaw }] =
    await Promise.all([
      (async () => {
        const [me, myListingsCount, favoritesCount, newLast7Days, likesOnMyListings, topCats30, recentListingsRaw] =
          await Promise.all([
            prisma.user.findUnique({
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
            }),
            prisma.product.count({ where: { sellerId: userId } }),
            prisma.favorite.count({ where: { userId } }),
            prisma.product.count({ where: { sellerId: userId, createdAt: { gte: since7d } } }),
            prisma.favorite.count({ where: { product: { sellerId: userId } } }),
            prisma.product.groupBy({
              by: ["category"],
              where: { status: "ACTIVE", createdAt: { gte: since30d } },
              _count: { category: true },
            }),
            prisma.product.findMany({
              where: { sellerId: userId },
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
                status: true,
              },
            }),
          ]);

        return {
          me,
          myListingsCount,
          favoritesCount,
          newLast7Days,
          likesOnMyListings,
          topCats30,
          recentListingsRaw,
        };
      })(),
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

  const topCategoriesSorted = [...topCats30]
    .sort((a, b) => (b._count.category ?? 0) - (a._count.category ?? 0))
    .slice(0, 5);

  const recentListings = recentListingsRaw as unknown as RecentListing[];
  const subLabel = me.subscription === "BASIC" ? "FREE" : me.subscription ?? "FREE";

  /* ---------------------------------- View ---------------------------------- */
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="rounded-2xl p-6 text-white shadow bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold">
              Welcome{me.name ? `, ${me.name}` : ""} 👋
            </h1>
            <p className="text-white/90">Manage your listings, favorites, and account.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/15 px-3 py-1 text-sm">
              Subscription: <span className="font-semibold">{subLabel}</span>
            </span>
            <Link
              href="/account/profile"
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#161748] hover:bg-white/90"
              title="Edit account"
            >
              Edit Account
            </Link>
            {subLabel === "FREE" && (
              <Link
                href="/settings/billing"
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#161748] hover:bg-white/90"
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
        <Link
          href="/api/auth/signout"
          className="ml-auto rounded-xl border px-4 py-2 font-semibold hover:bg-gray-50"
        >
          Sign out
        </Link>
      </div>

      {/* Stats */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric title="My Listings" value={myListingsCount} />
        <Metric title="My Favorites" value={favoritesCount} />
        <Metric title="New in last 7 days" value={newLast7Days} />
        <Metric title="Likes on my listings" value={likesOnMyListings} />
      </section>

      {/* Trends */}
      <section className="rounded-xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Market snapshot (last 30 days)</h2>
          <Link href="/" className="text-sm text-[#39a0ca] underline">
            Explore market →
          </Link>
        </div>
        {topCategoriesSorted.length === 0 ? (
          <div className="text-gray-600 dark:text-slate-300">No data yet.</div>
        ) : (
          <ul className="grid gap-1 text-sm text-gray-800 dark:text-slate-100 sm:grid-cols-2 lg:grid-cols-3">
            {topCategoriesSorted.map((c) => (
              <li key={c.category} className="flex items-center justify-between border-b py-1 dark:border-slate-800">
                <span>{c.category}</span>
                <span className="text-gray-500 dark:text-slate-400">{c._count.category}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Social links prompt */}
      <section className="rounded-xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-1 text-lg font-semibold">Boost your store</h2>
        <p className="mb-3 text-sm text-gray-600 dark:text-slate-300">
          Add your social links so buyers can trust your brand.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/account/profile#socials" className="rounded-xl border px-4 py-2 hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-800">
            Add social links
          </Link>
          {me.username && (
            <Link
              href={`/store/${me.username}`}
              className="rounded-xl border px-4 py-2 hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-800"
            >
              View my store
            </Link>
          )}
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
          <div className="text-gray-600 dark:text-slate-300">
            No listings yet. Get started by posting your first item.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentListings.map((p) => (
              <div key={p.id} className="group">
                <div className="relative overflow-hidden rounded-xl border border-gray-100 bg-white shadow transition hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
                  {p.featured ? (
                    <span className="absolute left-2 top-2 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs text-white shadow">
                      Verified
                    </span>
                  ) : null}

                  {p.status !== "ACTIVE" && (
                    <span className="absolute right-2 top-2 z-10 rounded-md bg-gray-800 px-2 py-1 text-xs text-white shadow">
                      {p.status}
                    </span>
                  )}

                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.image || "/placeholder/default.jpg"}
                    alt={p.name}
                    className="h-40 w-full object-cover"
                  />

                  <div className="p-4">
                    <h3 className="line-clamp-1 font-semibold text-gray-900 dark:text-white">{p.name}</h3>
                    <p className="line-clamp-1 text-xs text-gray-500 dark:text-slate-400">
                      {p.category} • {p.subcategory}
                    </p>
                    <p className="mt-1 font-bold text-[#161748] dark:text-brandBlue">
                      {fmtKES(p.price)}
                    </p>
                    <p className="mt-1 text-[11px] text-gray-400">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </p>

                    <div className="mt-3 flex gap-2">
                      <Link
                        href={`/product/${p.id}`}
                        className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-800"
                      >
                        View
                      </Link>
                      <Link
                        href={`/sell?id=${p.id}`}
                        className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-800"
                        title="Edit listing"
                      >
                        Edit
                      </Link>

                      {/* Client-only delete with long-press confirm */}
                      <DeleteListingButton productId={p.id} productName={p.name} />
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
    <div className="rounded-xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-sm text-gray-500 dark:text-slate-400">{title}</div>
      <div className="text-2xl font-bold text-[#161748] dark:text-white">
        {new Intl.NumberFormat("en-KE").format(value)}
      </div>
    </div>
  );
}
