// src/app/product/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { useProducts } from "@/app/lib/productsStore";
import FavoriteButton from "@/app/components/FavoriteButton";

type ProductFromStore = ReturnType<typeof useProducts> extends { products: infer U }
  ? U extends (infer V)[]
    ? V
    : never
  : never;

type RevealResponse = {
  product?: { id: string; name: string };
  contact?: { name?: string | null; phone?: string | null; location?: string | null };
  suggestLogin?: boolean;
  error?: string;
};

type FetchedProduct = Partial<ProductFromStore> & {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  subcategory: string;
  brand?: string | null;
  condition?: string | null;
  price?: number | null;
  image?: string | null;
  gallery?: string[];
  location?: string | null;
  negotiable?: boolean;
  featured?: boolean;
  sellerName?: string | null;
  sellerPhone?: string | null;
  sellerLocation?: string | null;
  sellerMemberSince?: string | null;
  sellerRating?: number | null;
  sellerSales?: number | null;
};

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || n <= 0) return "Contact for price";
  try {
    return `KES ${new Intl.NumberFormat("en-KE").format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

export default function ProductPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ? String(params.id) : "";

  const { products, ready } = useProducts();

  const [fetched, setFetched] = useState<FetchedProduct | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);

  const [revealed, setRevealed] = useState<RevealResponse | null>(null);
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealLoading, setRevealLoading] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  const [origin, setOrigin] = useState<string>("");
  const [hero, setHero] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const product = useMemo(() => {
    const p = products.find((x: any) => String(x.id) === id) as ProductFromStore | undefined;
    return (p as FetchedProduct) || undefined;
  }, [products, id]);

  useEffect(() => {
    if (!ready || !id) return;
    if (product) return;

    let cancelled = false;
    (async () => {
      try {
        setFetching(true);
        setFetchErr(null);
        const r = await fetch(`/api/products/${id}`, { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || `Failed to load (${r.status})`);
        if (!cancelled) setFetched(j as FetchedProduct);
      } catch (e: any) {
        if (!cancelled) setFetchErr(e?.message || "Failed to load product");
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, id, product]);

  const display = (product || fetched) as FetchedProduct | undefined;

  useEffect(() => {
    if (!display) return;
    const first = display.image || display.gallery?.[0] || "/placeholder/default.jpg";
    setHero(first);
  }, [display]);

  const seller = useMemo(() => {
    const nested: any = (display as any)?.seller || {};
    return {
      name: nested?.name ?? display?.sellerName ?? "Private Seller",
      phone: nested?.phone ?? display?.sellerPhone ?? null,
      location: nested?.location ?? display?.sellerLocation ?? null,
      memberSince: nested?.memberSince ?? display?.sellerMemberSince ?? null,
      rating:
        typeof nested?.rating === "number"
          ? nested.rating
          : typeof display?.sellerRating === "number"
          ? display.sellerRating
          : null,
      sales:
        typeof nested?.sales === "number"
          ? nested.sales
          : typeof display?.sellerSales === "number"
          ? display.sellerSales
          : null,
    };
  }, [display]);

  async function handleReveal() {
    if (!id) return;
    setRevealLoading(true);
    setRevealError(null);
    try {
      const res = await fetch(`/api/products/${id}/contact`, { cache: "no-store" });
      const data: RevealResponse = await res.json();
      if (!res.ok || data?.error) {
        setRevealError(data?.error || "Failed to fetch contact.");
      } else {
        setRevealed(data);
        setRevealOpen(true);
      }
    } catch {
      setRevealError("Network error.");
    } finally {
      setRevealLoading(false);
    }
  }

  const wa =
    revealed?.contact?.phone
      ? `https://wa.me/${revealed.contact.phone}?text=${encodeURIComponent(
          `Hi ${revealed.contact.name || "Seller"}, I'm interested in "${
            display?.name || "your item"
          }" on QwikSale. Is it still available?`
        )}`
      : null;

  async function copyLink() {
    if (!origin || !display?.id) return;
    try {
      await navigator.clipboard.writeText(`${origin}/product/${display.id}`);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  }

  if (!ready && !display) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-3">
          <div className="skeleton h-80 w-full rounded-xl" />
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-20 w-full rounded-lg" />
            ))}
          </div>
        </div>
        <div className="lg:col-span-2 space-y-4">
          <div className="skeleton h-6 w-3/4 rounded" />
          <div className="skeleton h-24 w-full rounded" />
          <div className="skeleton h-32 w-full rounded" />
          <div className="skeleton h-40 w-full rounded" />
        </div>
      </div>
    );
  }

  if (!display && (fetching || fetchErr)) {
    return <div className="text-gray-600 dark:text-slate-300">{fetching ? "Loading…" : fetchErr || "Product not found."}</div>;
  }

  if (!display) {
    return <div className="text-gray-600 dark:text-slate-300">Product not found.</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Images */}
      <div className="lg:col-span-3">
        <div className="relative bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 shadow-sm overflow-hidden">
          {display.featured && (
            <span className="absolute top-3 left-3 z-10 rounded-md bg-[#161748] text-white text-xs px-2 py-1 shadow">
              Verified
            </span>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hero || display.image || "/placeholder/default.jpg"}
            alt={display.name}
            className="w-full h-80 object-cover"
          />

          <div className="absolute top-3 right-3 z-10 flex gap-2">
            <button onClick={copyLink} className="btn-ghost px-2 py-1 text-xs">
              Copy link
            </button>
            <FavoriteButton productId={display.id} />
          </div>
        </div>

        {display.gallery && display.gallery.length > 0 && (
          <div className="mt-3 grid grid-cols-4 gap-2">
            {[display.image, ...(display.gallery || [])]
              .filter(Boolean)
              .slice(0, 8)
              .map((src, idx) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${src}-${idx}`}
                  src={src || "/placeholder/default.jpg"}
                  alt={`Gallery ${idx + 1}`}
                  className={`h-20 w-full object-cover rounded-lg border cursor-pointer ${
                    src === hero ? "ring-2 ring-brandBlue" : ""
                  }`}
                  onClick={() => setHero(src || null)}
                />
              ))}
          </div>
        )}
      </div>

      {/* Details */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{display.name}</h1>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-slate-400">
                {display.category} • {display.subcategory}
              </span>
              {display.featured && (
                <span className="whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium bg-[#161748] text-white">
                  Verified Seller
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <FavoriteButton productId={display.id} />
          </div>
        </div>

        <div className="rounded-xl border dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-1">
          <p className="text-2xl font-bold text-[#161748] dark:text-brandBlue">{fmtKES(display.price)}</p>
          {display.negotiable && <p className="text-sm text-gray-500">Negotiable</p>}
          {display.brand && <p className="text-sm text-gray-500">Brand: {display.brand}</p>}
          {display.condition && <p className="text-sm text-gray-500">Condition: {display.condition}</p>}
          {display.location && <p className="text-sm text-gray-500">Location: {display.location}</p>}
        </div>

        <div className="rounded-xl border dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="font-semibold mb-2">Description</h2>
          <p className="text-gray-700 dark:text-slate-200 whitespace-pre-line">
            {display.description || "No description provided."}
          </p>
        </div>

        {/* Seller box */}
        <div className="rounded-xl border dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="font-semibold mb-3">Seller</h3>
          <div className="space-y-1 text-gray-700 dark:text-slate-200">
            <p><span className="font-medium">Name:</span> {seller.name || "Private Seller"}</p>
            {seller.location && <p><span className="font-medium">Location:</span> {seller.location}</p>}
            {seller.memberSince && <p><span className="font-medium">Member since:</span> {seller.memberSince}</p>}
            {typeof seller.rating === "number" && <p><span className="font-medium">Rating:</span> {seller.rating} / 5</p>}
            {typeof seller.sales === "number" && <p><span className="font-medium">Completed sales:</span> {seller.sales}</p>}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {wa ? (
              <a href={wa} target="_blank" rel="noreferrer" className="rounded-lg px-5 py-3 text-white font-semibold shadow bg-[#25D366] hover:opacity-90">
                Contact on WhatsApp
              </a>
            ) : (
              <button
                onClick={handleReveal}
                disabled={revealLoading}
                className="rounded-lg px-5 py-3 text-white font-semibold shadow bg-[#161748] hover:opacity-90 disabled:opacity-60"
                title="Reveal seller contact"
              >
                {revealLoading ? "Revealing…" : "Show Contact"}
              </button>
            )}

            <Link href="/donate" className="rounded-lg border px-5 py-3 font-semibold hover:bg-gray-50 dark:hover:bg-slate-800">
              Donate
            </Link>

            {display.featured && (
              <div className="inline-flex items-center gap-2 rounded-full bg-[#161748] text-white text-xs px-3 py-1 ml-auto">
                <span>Priority support</span>
                <span className="opacity-70">•</span>
                <span>Top placement</span>
              </div>
            )}
          </div>

          <div className="mt-4 text-xs text-gray-500 dark:text-slate-400">
            Safety: meet in public places, inspect items carefully, and never share sensitive information.
          </div>
        </div>
      </div>

      {/* Contact Modal */}
      {revealOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md p-5 shadow-lg border dark:border-slate-800">
            {revealed?.suggestLogin && (
              <div className="mb-3 p-3 text-sm rounded-xl border border-yellow-200 bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-800 dark:text-yellow-200">
                For safety, we recommend logging in first. You can still proceed.
              </div>
            )}
            <h3 className="font-semibold mb-2">Seller Contact</h3>
            <div className="space-y-1 text-sm">
              <div><span className="font-medium">Name:</span> {revealed?.contact?.name ?? seller.name ?? "—"}</div>
              <div><span className="font-medium">Phone:</span> {revealed?.contact?.phone ?? "—"}</div>
              <div><span className="font-medium">Location:</span> {revealed?.contact?.location ?? seller.location ?? "—"}</div>
            </div>

            {revealError && <div className="mt-3 text-sm text-red-600">{revealError}</div>}

            <div className="mt-4 flex justify-end gap-2">
              {wa && (
                <a href={wa} target="_blank" rel="noreferrer" className="px-3 py-1 rounded-xl bg-[#25D366] text-white text-sm">
                  WhatsApp
                </a>
              )}
              <button onClick={() => setRevealOpen(false)} className="px-3 py-1 rounded-xl border dark:border-slate-700">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
