import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/app/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type StoreProduct = {
  id: string;
  name: string;
  image: string | null;
  price: number | null;
  featured: boolean;
  category: string;
  subcategory: string;
  createdAt: Date;
};

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || n <= 0) return "Contact for price";
  try {
    return `KES ${new Intl.NumberFormat("en-KE").format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

/* ----------------------------- Metadata ----------------------------- */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username: raw } = await params;
  const username = decodeURIComponent(raw || "").trim();

  if (!username) return { title: "Store | QwikSale" };

  // Best-effort fetch to personalize title; avoid throwing in metadata
  try {
    const user = await prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
      select: { username: true, name: true },
    });
    if (user) {
      return {
        title: `${user.name ? `${user.name} (@${user.username})` : `@${user.username}`} | Store | QwikSale`,
        description: `Browse listings from ${user.name || `@${user.username}`} on QwikSale.`,
      };
    }
  } catch {
    // ignore metadata errors
  }
  return {
    title: `@${username} | Store | QwikSale`,
    description: `Browse listings from @${username} on QwikSale.`,
  };
}

/* ----------------------------- Page ----------------------------- */
export default async function StorePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: rawUsername } = await params;
  const username = decodeURIComponent(rawUsername || "").trim();
  if (!username) notFound();

  // 1) Find the user (case-insensitive)
  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      username: true,
      image: true,
      city: true,
      country: true,
      createdAt: true,
    },
  });
  if (!user) notFound();

  // 2) Store listings: only ACTIVE, owned by the user, featured first, newest next
  const products = (await prisma.product.findMany({
    where: {
      sellerId: user.id,
      status: "ACTIVE", // adjust if you use an enum: status: ProductStatus.ACTIVE
    },
    orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
    take: 48,
    select: {
      id: true,
      name: true,
      image: true,
      price: true,
      featured: true,
      category: true,
      subcategory: true,
      createdAt: true,
    },
  })) as StoreProduct[];

  return (
    <div className="space-y-6">
      {/* Store header */}
      <div className="rounded-2xl p-6 text-white shadow bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]">
        <div className="flex items-center gap-4">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt={`${user.username} avatar`}
              className="h-14 w-14 rounded-full object-cover ring-2 ring-white/50"
              onError={(e) => {
                const img = e.currentTarget as HTMLImageElement;
                img.src = "/placeholder/default.jpg";
              }}
            />
          ) : (
            <div className="h-14 w-14 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold">
              {(user.name || user.username || "U").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold">@{user.username}</h1>
            <p className="text-white/90 text-sm">
              {user.name ? `${user.name} • ` : ""}
              Member since {new Date(user.createdAt).getFullYear()}
              {user.city || user.country
                ? ` • ${[user.city, user.country].filter(Boolean).join(", ")}`
                : ""}
            </p>
          </div>
          <div className="ml-auto">
            <Link
              href="/"
              className="rounded-xl bg-white text-[#161748] px-4 py-2 text-sm font-semibold hover:bg-white/90"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>

      {/* Listings */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {products.length > 0 ? "Available Products" : "No products yet"}
          </h2>
        </div>

        {products.length === 0 ? (
          <div className="text-gray-600">
            This store hasn’t posted any items yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((p) => {
              const img = p.image || "/placeholder/default.jpg";
              return (
                <Link key={p.id} href={`/product/${p.id}`} className="group">
                  <div className="relative bg-white rounded-xl shadow hover:shadow-lg transition overflow-hidden border border-gray-100">
                    {p.featured && (
                      <span className="absolute top-2 left-2 z-10 rounded-md bg-[#161748] text-white text-xs px-2 py-1 shadow">
                        Verified
                      </span>
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img}
                      alt={p.name}
                      className="w-full h-40 object-cover"
                      onError={(e) => {
                        const el = e.currentTarget as HTMLImageElement;
                        el.src = "/placeholder/default.jpg";
                      }}
                    />
                    <div className="p-4">
                      <h3 className="font-semibold text-gray-900 line-clamp-1">
                        {p.name}
                      </h3>
                      <p className="text-xs text-gray-500 line-clamp-1">
                        {p.category} • {p.subcategory}
                      </p>
                      <p className="text-[#161748] font-bold mt-1">
                        {fmtKES(p.price)}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-1">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
