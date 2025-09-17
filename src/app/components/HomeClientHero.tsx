// src/app/_components/HomeClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import HomeClientHero from "@/app/components/HomeClientHero";

type Product = {
  id: string;
  name: string;
  image?: string | null;
  price?: number | null;
  createdAt?: string | Date | null;
  category?: string | null;
  subcategory?: string | null;
  status?: "ACTIVE" | "SOLD" | "HIDDEN" | "DRAFT";
};

function fmtKES(n?: number | null) {
  if (!n || n <= 0) return "Contact for price";
  try {
    return `KES ${new Intl.NumberFormat("en-KE").format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

const PLACEHOLDER = "/placeholder/default.jpg";

export default function HomeClient() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<Product[]>([]);

  // One place to tweak the feed endpoint if needed later.
  // We ask for ACTIVE only, sort by createdAt desc, and keep it fresh with cache: "no-store".
  const feedUrl = useMemo(() => {
    const p = new URLSearchParams({
      status: "ACTIVE",
      sort: "createdAt",
      order: "desc",
      limit: "24",
    });
    // If your API is different, change this path only:
    return `/api/products?${p.toString()}`;
  }, []);

  useEffect(() => {
    let cancel = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const r = await fetch(feedUrl, { cache: "no-store" });
        let j: any = null;
        try {
          j = await r.json();
        } catch {
          /* ignore parse error; handled below */
        }
        if (!r.ok) {
          throw new Error(j?.error || `Failed (${r.status})`);
        }

        // Accept several response shapes:
        const arr: any[] = Array.isArray(j)
          ? j
          : Array.isArray(j?.items)
          ? j.items
          : Array.isArray(j?.products)
          ? j.products
          : [];

        // Filter ACTIVE defensively and sort desc by createdAt
        const normalized: Product[] = arr
          .filter((p) => (p?.status ?? "ACTIVE") === "ACTIVE")
          .map((p) => ({
            id: String(p.id),
            name: String(p.name ?? "Untitled"),
            image: p.image ?? null,
            price: typeof p.price === "number" ? p.price : null,
            createdAt: p.createdAt ?? null,
            category: p.category ?? null,
            subcategory: p.subcategory ?? null,
            status: p.status ?? "ACTIVE",
          }))
          .sort((a, b) => {
            const ta = a.createdAt ? new Date(a.createdAt as any).getTime() : 0;
            const tb = b.createdAt ? new Date(b.createdAt as any).getTime() : 0;
            return tb - ta; // newest first
          });

        if (!cancel) setItems(normalized);
      } catch (e: any) {
        if (!cancel) setErr(e?.message || "Could not load latest listings");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [feedUrl]);

  return (
    <div className="p-6 space-y-6">
      {/* Signed-in hello + quick actions */}
      <HomeClientHero />

      {/* Newest / header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Newest Listings</h2>
        <div className="flex items-center gap-2">
          <Link href="/search" className="text-sm text-[#39a0ca] underline">
            Explore all →
          </Link>
        </div>
      </div>

      {/* States */}
      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
          {err}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="skeleton h-40 w-full rounded-lg" />
              <div className="mt-3 space-y-2">
                <div className="skeleton h-4 w-3/4 rounded" />
                <div className="skeleton h-4 w-1/3 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-sm text-gray-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          No active listings yet.{" "}
          <Link href="/sell" className="text-[#39a0ca] underline">
            Post your first →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((p) => (
            <article
              key={p.id}
              className="group overflow-hidden rounded-xl border border-gray-100 bg-white shadow transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
            >
              <Link href={`/product/${p.id}`} className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.image || PLACEHOLDER}
                  alt={p.name}
                  className="h-40 w-full object-cover"
                  loading="lazy"
                />
                <div className="p-3">
                  <h3 className="line-clamp-1 font-semibold text-gray-900 dark:text-white">
                    {p.name}
                  </h3>
                  <p className="line-clamp-1 text-xs text-gray-500 dark:text-slate-400">
                    {p.category || "General"}
                    {p.subcategory ? ` • ${p.subcategory}` : ""}
                  </p>
                  <p className="mt-1 font-bold text-[#161748] dark:text-brandBlue">
                    {fmtKES(p.price)}
                  </p>
                </div>
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
