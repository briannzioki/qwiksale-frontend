import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/app/lib/prisma";
import UserAvatar from "@/app/components/UserAvatar";
import Image from "next/image";
import { imgUrl } from "@/app/li/cdn";

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
    /* ignore metadata errors */
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
      status: "ACTIVE",
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
          <UserAvatar
            src={user.image}
            alt={`${user.username} avatar`}
            size={56}
            ring
            fallbackText={(user.name || user.username || "U").slice(0, 1).toUpperCase()}
          />

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
            <Link href="/" className="btn-outline">
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
          <div className="text-gray-600 dark:text-slate-300">
            This store hasn’t posted any items yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((p) => {
              const rawImg = p.image || "/placeholder/default.jpg";
              const thumb = imgUrl(rawImg, { w: 600, h: 320, fit: "fill", gravity: "auto" }) || rawImg;
              return (
                <Link key={p.id} href={`/product/${p.id}`} className="group">
                  <div className="relative overflow-hidden rounded-xl border border-gray-100 bg-white shadow transition hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
                    {p.featured && (
                      <span className="absolute top-2 left-2 z-10 rounded-md bg-[#161748] text-white text-xs px-2 py-1 shadow">
                        Verified
                      </span>
                    )}
                    <div className="w-full h-40 relative">
                      <Image
                        src={thumb}
                        alt={p.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        priority={false}
                      />
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-1">
                        {p.name}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-1">
                        {p.category} • {p.subcategory}
                      </p>
                      <p className="text-[#161748] dark:text-brandBlue font-bold mt-1">
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
