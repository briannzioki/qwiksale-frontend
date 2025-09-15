// src/app/saved/page.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { toast } from "react-hot-toast";
import FavoriteButton from "../components/FavoriteButton";
import { useProducts } from "../lib/productsStore";
import { useFavourites } from "../lib/favoritesStore";
import { getJson } from "@/app/lib/http"; // ensures credentials: "include"
import { shimmer } from "@/app/lib/blur";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type ApiProduct = {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  brand?: string | null;
  condition?: string | null;
  price?: number | null;
  image?: string | null;
  featured?: boolean | null;
};

type ApiFavorite = {
  productId: string;
  createdAt: string;
  product: ApiProduct;
};

type ApiResponse = { items: ApiFavorite[]; nextCursor?: string | null };

/* ------------------------------------------------------------------ */
/* Utils                                                              */
/* ------------------------------------------------------------------ */

function fmtKES(n?: number | null) {
  if (!n || n <= 0) return "Contact for price";
  try {
    return `KES ${new Intl.NumberFormat("en-KE").format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

/** One-argument onError factory to satisfy TS (Next/Image forwards only event). */
const makeImageOnError =
  (fallback: string) =>
  (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img && img.src !== fallback) img.src = fallback;
  };

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function SavedPage() {
  const { status: sessionStatus } = useSession();

  // Local stores (fallback if API fails or user is signed out)
  const { products } = useProducts();
  const { ids } = useFavourites();

  // Remote favorites
  const [favItems, setFavItems] = React.useState<ApiFavorite[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [origin, setOrigin] = React.useState<string>("");

  React.useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      setFavItems(null);
      try {
        // credentials: "include" is handled by getJson()
        const data = await getJson<ApiResponse>("/api/favorites?format=full&limit=100");
        if (!cancelled) setFavItems(Array.isArray(data?.items) ? data.items : []);
      } catch (e: any) {
        // Gracefully treat 401 as â€œnot signed inâ€
        const msg = e?.message || "Failed to load favorites";
        if (!cancelled) setErr(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionStatus]);

  // Fallback list (local store) if API not available or errored
  const fallbackFavs: ApiFavorite[] = React.useMemo(() => {
    const selected = products.filter((p) => ids.includes(String(p.id)));
    return selected.map((p) => ({
      productId: p.id,
      createdAt: new Date().toISOString(),
      product: {
        id: p.id,
        name: p.name,
        category: p.category,
        subcategory: p.subcategory,
        brand: p.brand ?? null,
        condition: p.condition ?? null,
        price: p.price ?? null,
        image: p.image ?? null,
        featured: !!p.featured,
      },
    }));
  }, [products, ids]);

  // Choose list: API first, else fallback
  const list: ApiFavorite[] = React.useMemo(() => {
    if (favItems) return favItems;
    if (err) return fallbackFavs;
    if (!loading && sessionStatus === "unauthenticated") return []; // signed out
    return [];
  }, [favItems, fallbackFavs, err, loading, sessionStatus]);

  const count = list.length;

  async function copyLink(id: string) {
    const url = origin ? `${origin}/product/${id}` : `/product/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  }

  return (
    <div className="container-page py-6 space-y-6">
      {/* Hero */}
      <div className="rounded-2xl p-8 text-white shadow-soft dark:shadow-none bg-gradient-to-r from-brandBlue via-brandGreen to-brandNavy">
        <h1 className="text-2xl md:text-3xl font-extrabold">Saved Items</h1>
        <p className="text-white/90">Your favorites live here. {count ? `(${count})` : ""}</p>
      </div>

      {/* States */}
      {sessionStatus === "loading" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card p-4">
              <div className="skeleton h-44 w-full rounded-lg" />
              <div className="mt-3 space-y-2">
                <div className="skeleton h-4 w-3/4 rounded" />
                <div className="skeleton h-3 w-1/2 rounded" />
                <div className="skeleton h-4 w-1/3 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : sessionStatus === "unauthenticated" ? (
        <div className="card p-6 flex items-center justify-between">
          <div className="text-sm text-gray-700 dark:text-slate-200">
            Youâ€™re not signed in. Sign in to see your saved items synced across devices.
          </div>
          <a className="btn-gradient-primary" href={`/signin?callbackUrl=${encodeURIComponent("/saved")}`}>
            Sign in
          </a>
        </div>
      ) : loading ? (
        <div className="text-gray-600 dark:text-slate-300">Loading your favoritesâ€¦</div>
      ) : err && !list.length ? (
        <div className="card p-6 space-y-3">
          <div className="text-red-600">{err}</div>
          <div className="text-sm text-gray-700 dark:text-slate-200">
            Showing local favorites isnâ€™t available yet. Try again shortly.
          </div>
        </div>
      ) : list.length === 0 ? (
        <div className="text-gray-600 dark:text-slate-300">
          No saved items yet. Browse the{" "}
          <Link href="/" className="link">
            homepage
          </Link>{" "}
          and tap the heart â¤ï¸.
        </div>
      ) : (
        <>
          {/* Grid */}
          <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
            {list.map((fav) => {
              const p = fav.product;
              const fallback = "/placeholder/default.jpg";
              const imgUrl = p.image || fallback;

              return (
                <Link key={p.id} href={`/product/${p.id}`} className="group relative">
                  <div className="bg-white dark:bg-slate-900 rounded-xl shadow hover:shadow-lg transition cursor-pointer overflow-hidden border border-gray-100 dark:border-slate-800 group-hover:border-brandBlue/60">
                    <div className="relative">
                      {p.featured ? (
                        <span className="absolute top-2 left-2 z-10 rounded-md bg-brandNavy text-white text-xs px-2 py-1 shadow">Featured</span>
                      ) : null}

                      {/* Image with blur shimmer */}
                      <div className="relative w-full h-44">
                        <Image
                          src={imgUrl}
                          alt={p.name}
                          fill
                          className="object-cover"
                          placeholder="blur"
                          /* shimmer now expects an options object */
                          blurDataURL={shimmer({ width: 640, height: 360 })}
                          sizes="(max-width: 768px) 100vw, 33vw"
                          onError={makeImageOnError(fallback)}
                        />
                      </div>

                      <div className="absolute top-2 right-2 z-10 flex gap-1">
                        <FavoriteButton productId={p.id} compact />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            copyLink(p.id);
                          }}
                          className="btn-outline px-2 py-1 text-xs"
                          title="Copy link"
                        >
                          Copy
                        </button>
                      </div>
                    </div>

                    <div className="p-4">
                      <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-1">
                        {p.name}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-slate-400 line-clamp-1">
                        {p.category} â€¢ {p.subcategory}
                      </p>
                      {p.brand && (
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                          Brand: {p.brand}
                        </p>
                      )}
                      <p className="text-brandBlue font-bold mt-2">{fmtKES(p.price)}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>

          {/* Footer actions */}
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/" className="btn-outline">
              Continue browsing
            </Link>
            <Link href="/sell" className="btn-outline">
              Post a listing
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
