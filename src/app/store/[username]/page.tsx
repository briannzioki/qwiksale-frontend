export const revalidate = 300;
// src/app/store/[username]/page.tsx
export const runtime = "nodejs";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import { prisma } from "@/app/lib/prisma";
import UserAvatar from "@/app/components/UserAvatar";
import { imgUrl } from "@/app/li/cdn";

/* ----------------------------- utils ----------------------------- */
function fmtKES(n?: number | null) {
  if (typeof n !== "number" || n <= 0) return "Contact for price";
  try {
    return `KES ${new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

function cleanUsername(raw?: string) {
  const v = decodeURIComponent(String(raw ?? "")).trim();
  // Basic sanity: allow letters, numbers, underscore, dot, dash (adjust to your rules)
  return /^[a-z0-9._-]{2,32}$/i.test(v) ? v : "";
}

/* ----------------------------- Metadata ----------------------------- */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username: raw } = await params;
  const username = cleanUsername(raw);
  if (!username) return { title: "Store | QwikSale" };

  try {
    const user = await prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
      select: { username: true, name: true },
    });

    if (user) {
      const display = user.name ? `${user.name} (@${user.username})` : `@${user.username}`;
      return {
        title: `${display} | Store | QwikSale`,
        description: `Browse listings from ${user.name || `@${user.username}`} on QwikSale.`,
      };
    }
  } catch {
    /* ignore metadata errors; return generic below */
  }

  return {
    title: `@${username} | Store | QwikSale`,
    description: `Browse listings from @${username} on QwikSale.`,
  };
}

/* ----------------------------- Page ----------------------------- */
type StoreProduct = {
  id: string;
  name: string;
  image: string | null;
  price: number | null;
  featured: boolean;
  category: string | null;
  subcategory: string | null;
  createdAt: string; // serialized
};

export default async function StorePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: raw } = await params;
  const username = cleanUsername(raw);
  if (!username) notFound();

  // 1) Resolve the owner
  const user = await prisma.user
    .findFirst({
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
    })
    .catch(() => null);

  if (!user) notFound();

  // 2) Fetch up to 48 ACTIVE products for this seller
  const productsRaw = await prisma.product
    .findMany({
      where: { sellerId: user.id, status: "ACTIVE" },
      orderBy: [{ featured: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }],
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
    })
    .catch(() => []);

  const products: StoreProduct[] = (productsRaw as any[]).map((p) => ({
    ...p,
    category: p.category ?? null,
    subcategory: p.subcategory ?? null,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt ?? ""),
  }));

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
              {user.name ? `${user.name} â€¢ ` : ""}
              Member since {new Date(user.createdAt).getFullYear()}
              {user.city || user.country ? ` â€¢ ${[user.city, user.country].filter(Boolean).join(", ")}` : ""}
            </p>
          </div>
          <div className="ml-auto">
            <Link href="/" className="btn-outline">Back to Home</Link>
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
          <div className="text-gray-600 dark:text-slate-300">This store hasnâ€™t posted any items yet.</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => {
              const rawImg = p.image || "/placeholder/default.jpg";
              const thumb = imgUrl(rawImg, { w: 600, h: 320, fit: "fill", gravity: "auto" }) || rawImg;

              return (
                <Link key={p.id} href={`/product/${p.id}`} className="group">
                  <div className="relative overflow-hidden rounded-xl border border-gray-100 bg-white shadow transition hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
                    {p.featured && (
                      <span className="absolute left-2 top-2 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs text-white shadow">
                        Verified
                      </span>
                    )}
                    <div className="relative h-40 w-full">
                      <Image
                        src={thumb}
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
                        {[p.category, p.subcategory].filter(Boolean).join(" â€¢ ") || "â€”"}
                      </p>
                      <p className="mt-1 font-bold text-[#161748] dark:text-brandBlue">{fmtKES(p.price)}</p>
                      <p className="mt-1 text-[11px] text-gray-400">
                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ""}
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
