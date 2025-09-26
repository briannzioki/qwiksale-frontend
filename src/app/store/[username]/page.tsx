// src/app/store/[username]/page.tsx
export const revalidate = 300;
export const runtime = "nodejs";

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/app/lib/prisma";
import UserAvatar from "@/app/components/UserAvatar";
import SmartImage from "@/app/components/SmartImage";

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
  return /^[a-z0-9._-]{2,32}$/i.test(v) ? v : "";
}

/* ----------------------------- Metadata ----------------------------- */
export async function generateMetadata(
  props: { params: Promise<{ username: string }> }
): Promise<Metadata> {
  const { username: raw } = await props.params;
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
  name: string;
  image: string | null;
  price: number | null;
  featured: boolean | null;
  category: string | null;
  subcategory: string | null;
  createdAt?: string | null;
};

type StoreService = {
  id: string;
  name: string;
  image: string | null;
  price: number | null;
  featured: boolean | null;
  category: string | null;
  subcategory: string | null;
  createdAt?: string | null;
};

/* ----------------------------- Page ----------------------------- */
export default async function StorePage(
  props: { params: Promise<{ username: string }> }
) {
  const { username: raw } = await props.params;
  const username = cleanUsername(raw);
  if (!username) notFound();

  // Resolve seller by username (SSR)
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

  // Pull both products & services for this seller via API (so we can tag caches)
  const qs = `sellerId=${encodeURIComponent(user.id)}&pageSize=48&sort=newest`;

  const [prodRes, svcRes] = await Promise.all([
    fetch(`/api/products?${qs}`, {
      next: { tags: ["products", `user:${user.id}:products`, `store:${username}`] },
    }),
    fetch(`/api/services?${qs}`, {
      next: { tags: ["services", `user:${user.id}:services`, `store:${username}`] },
    }),
  ]);

  // Gracefully handle API hiccups
  const productsJson: ApiListResp<StoreProduct> = prodRes.ok
    ? await prodRes.json()
    : { page: 1, pageSize: 0, total: 0, totalPages: 1, items: [] };

  const servicesJson: ApiListResp<StoreService> = svcRes.ok
    ? await svcRes.json()
    : { page: 1, pageSize: 0, total: 0, totalPages: 1, items: [] };

  // Normalize a couple of nullable fields for UI
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
              {user.city || user.country ? ` • ${[user.city, user.country].filter(Boolean).join(", ")}` : ""}
            </p>
          </div>
          <div className="ml-auto">
            <Link href="/" className="btn-outline">Back to Home</Link>
          </div>
        </div>
      </div>

      {/* Products */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {productsJson.total > 0 ? "Products" : "No products yet"}
          </h2>
          {productsJson.total > 0 ? (
            <span className="text-sm text-gray-500">{productsJson.total} items</span>
          ) : null}
        </div>

        {products.length === 0 ? (
          <div className="text-gray-600 dark:text-slate-300">
            This store hasn’t posted any products yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <Link key={p.id} href={`/product/${p.id}`} className="group">
                <div className="relative overflow-hidden rounded-xl border border-gray-100 bg-white shadow transition hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
                  {p.featured ? (
                    <span className="absolute left-2 top-2 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs text-white shadow">
                      Featured
                    </span>
                  ) : null}
                  <div className="relative h-40 w-full bg-gray-100">
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
        )}
      </section>

      {/* Services */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {servicesJson.total > 0 ? "Services" : "No services yet"}
          </h2>
          {servicesJson.total > 0 ? (
            <span className="text-sm text-gray-500">{servicesJson.total} items</span>
          ) : null}
        </div>

        {services.length === 0 ? (
          <div className="text-gray-600 dark:text-slate-300">
            This store hasn’t posted any services yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <Link key={s.id} href={`/service/${s.id}`} className="group">
                <div className="relative overflow-hidden rounded-xl border border-gray-100 bg-white shadow transition hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
                  {s.featured ? (
                    <span className="absolute left-2 top-2 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs text-white shadow">
                      Featured
                    </span>
                  ) : null}
                  <div className="relative h-40 w-full bg-gray-100">
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
        )}
      </section>
    </div>
  );
}
