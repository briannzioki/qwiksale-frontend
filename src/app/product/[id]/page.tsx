// src/app/product/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import toast from "react-hot-toast";
import { useProducts } from "@/app/lib/productsStore";
import FavoriteButton from "@/app/components/FavoriteButton";
import DeleteListingButton from "@/app/components/DeleteListingButton";
import { buildProductSeo } from "@/app/lib/seo";
import Gallery from "@/app/components/Gallery";
import ContactModal from "@/app/components/ContactModal";

type ProductFromStore =
  ReturnType<typeof useProducts> extends { products: infer U }
    ? U extends (infer V)[]
      ? V
      : never
    : never;

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
  sellerId?: string | null;
  sellerName?: string | null;
  sellerPhone?: string | null;
  sellerLocation?: string | null;
  sellerMemberSince?: string | null;
  sellerRating?: number | null;
  sellerSales?: number | null;
  seller?: {
    id?: string;
    username?: string | null;
    name?: string | null;
    image?: string | null;
    phone?: string | null;
    location?: string | null;
    memberSince?: string | null;
    rating?: number | null;
    sales?: number | null;
  } | null;
};

const PLACEHOLDER = "/placeholder/default.jpg";

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || n <= 0) return "Contact for price";
  try {
    return `KES ${new Intl.NumberFormat("en-KE").format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

/** Client-side message starter used when the user is signed in */
async function startThread(
  sellerUserId: string,
  listingType: "product" | "service",
  listingId: string,
  firstMessage?: string
) {
  try {
    const r = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ toUserId: sellerUserId, listingType, listingId, firstMessage }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.threadId) throw new Error(j?.error || "Failed to start chat");
    window.location.href = "/messages";
  } catch (e: any) {
    toast.error(e?.message || "Could not start chat");
  }
}

export default function ProductPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";

  const router = useRouter();
  const { data: session } = useSession();
  const isAuthed = Boolean(session?.user);

  const { products, ready } = useProducts();

  const [fetched, setFetched] = useState<FetchedProduct | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);

  const [origin, setOrigin] = useState<string>("");
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const product = useMemo(() => {
    if (!id) return undefined;
    const p = products.find((x: any) => String(x.id) === id) as ProductFromStore | undefined;
    return (p as FetchedProduct) || undefined;
  }, [products, id]);

  useEffect(() => {
    if (!ready || !id || product) return;
    let cancelled = false;
    (async () => {
      try {
        setFetching(true);
        setFetchErr(null);
        const r = await fetch(`/api/products/${encodeURIComponent(id)}`, { cache: "no-store" });
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

  // Prefer store/fetched if available, otherwise a minimal fallback that still powers the UI
  const displayMaybe = (product || fetched) as FetchedProduct | undefined;
  const display: FetchedProduct = {
    id: displayMaybe?.id ?? (id || "unknown"),
    name: displayMaybe?.name ?? "Listing",
    category: displayMaybe?.category ?? "General",
    subcategory: displayMaybe?.subcategory ?? "General",
    description: displayMaybe?.description ?? null,
    brand: displayMaybe?.brand ?? null,
    condition: displayMaybe?.condition ?? null,
    price: typeof displayMaybe?.price === "number" ? displayMaybe?.price : null,
    image: displayMaybe?.image ?? null,
    gallery: displayMaybe?.gallery ?? [],
    location: displayMaybe?.location ?? null,
    negotiable: Boolean(displayMaybe?.negotiable),
    featured: Boolean(displayMaybe?.featured),
    sellerId: displayMaybe?.sellerId ?? null,
    sellerName: displayMaybe?.sellerName ?? null,
    sellerPhone: displayMaybe?.sellerPhone ?? null,
    sellerLocation: displayMaybe?.sellerLocation ?? null,
    sellerMemberSince: displayMaybe?.sellerMemberSince ?? null,
    sellerRating:
      typeof displayMaybe?.sellerRating === "number" ? displayMaybe?.sellerRating : null,
    sellerSales:
      typeof displayMaybe?.sellerSales === "number" ? displayMaybe?.sellerSales : null,
    seller: displayMaybe?.seller ?? null,
  };

  const seo = useMemo(() => {
    const imgs = [display.image, ...(display.gallery ?? [])].filter(Boolean) as string[];
    const args: Parameters<typeof buildProductSeo>[0] = {
      id: display.id,
      name: display.name,
      ...(display.description != null ? { description: display.description } : {}),
      ...(typeof display.price === "number" ? { price: display.price as number | null } : {}),
      ...(imgs.length ? { image: imgs } : {}),
      ...(display.brand ? { brand: display.brand } : {}),
      ...(display.category ? { category: display.category } : {}),
      ...(display.condition ? { condition: display.condition } : {}),
      status: "ACTIVE",
      urlPath: `/product/${display.id}`,
    };
    return buildProductSeo(args);
  }, [display]);

  const images = useMemo(() => {
    const set = new Set<string>();
    if (display?.image) set.add(display.image);
    (display?.gallery || []).forEach((u) => {
      const s = (u || "").trim();
      if (s) set.add(s);
    });
    if (set.size === 0) set.add(PLACEHOLDER);
    return Array.from(set);
  }, [display?.image, display?.gallery]);

  const seller = useMemo(() => {
    const nested: any = (display as any)?.seller || {};
    const username = (nested?.username || "").trim() || null;
    return {
      id: nested?.id ?? display?.sellerId ?? null,
      username,
      name: nested?.name ?? display?.sellerName ?? "Private Seller",
      image: nested?.image ?? null,
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

  const isOwner = Boolean((session?.user as any)?.id && seller.id && (session?.user as any)?.id === seller.id);

  const copyLink = useCallback(async () => {
    if (!origin || !display?.id) return;
    try {
      await navigator.clipboard.writeText(`${origin}/product/${display.id}`);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  }, [origin, display?.id]);

  // Local Message dialog state (always available)
  const [showMessage, setShowMessage] = useState(false);
  const [messageText, setMessageText] = useState(
    () => `Hi ${seller.name || "there"}, I'm interested in "${display?.name ?? "your listing"}".`
  );
  const [sending, setSending] = useState(false);

  // Close message dialog with Escape
  useEffect(() => {
    if (!showMessage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowMessage(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showMessage]);

  const doSendMessage = useCallback(async () => {
    if (!display) return;
    if (!seller.id) {
      toast.error("Seller unavailable");
      return;
    }
    if (!isAuthed) {
      toast.error("Please sign in to start a chat");
      return;
    }
    try {
      setSending(true);
      await startThread(seller.id, "product", display.id, messageText);
    } finally {
      setSending(false);
    }
  }, [display, seller.id, isAuthed, messageText]);

  // Build a robust store href that always points under /store/...
  const storeSlug =
    (seller.username && seller.username.trim()) ||
    (seller.id ? `u-${String(seller.id).slice(0, 8)}` : "unknown");
  const storeHref = `/store/${storeSlug}`;

  return (
    <>
      {/* SEO only if we have meaningful data */}
      {seo?.jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(seo.jsonLd) }}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Media */}
        <div className="lg:col-span-3">
          <div className="relative overflow-hidden rounded-xl border bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {display.featured && (
              <span className="absolute left-3 top-3 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs text-white shadow">
                Featured
              </span>
            )}

            <Gallery images={images} lightbox />
            <div className="absolute right-3 top-3 z-10 flex gap-2">
              <button onClick={copyLink} className="btn-outline px-2 py-1 text-xs" title="Copy link">
                Copy link
              </button>

              {/* Only show actions that require a real product id when we truly have one */}
              {displayMaybe?.id && (
                <>
                  <FavoriteButton productId={display.id} />
                  {isOwner && (
                    <>
                      <Link
                        href={`/sell?id=${display.id}`}
                        className="rounded border bg-white/90 px-2 py-1 text-xs hover:bg-white"
                        title="Edit listing"
                      >
                        Edit
                      </Link>
                      <DeleteListingButton
                        id={display.id}
                        type="product"
                        className="rounded bg-red-600/90 px-2 py-1 text-xs text-white hover:bg-red-600"
                        label="Delete"
                        confirmText="Delete this listing? This cannot be undone."
                        afterDeleteAction={() => {
                          toast.success("Listing deleted");
                          router.push("/dashboard");
                        }}
                      />
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {display.name || "Listing"}
              </h1>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-slate-400">
                  {display.category || "General"} • {display.subcategory || "General"}
                </span>
                {display.featured && (
                  <span className="whitespace-nowrap rounded-full bg-[#161748] px-3 py-1 text-xs font-medium text-white">
                    Verified Seller
                  </span>
                )}
              </div>
              {(fetching || fetchErr) && (
                <div className="mt-2 text-xs text-gray-500">
                  {fetching ? "Loading details…" : "Showing limited info"}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1 rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-2xl font-bold text-[#161748] dark:text-brandBlue">
              {fmtKES(display.price)}
            </p>
            {display.negotiable && <p className="text-sm text-gray-500">Negotiable</p>}
            {display.brand && <p className="text-sm text-gray-500">Brand: {display.brand}</p>}
            {display.condition && (
              <p className="text-sm text-gray-500">Condition: {display.condition}</p>
            )}
            {display.location && (
              <p className="text-sm text-gray-500">Location: {display.location}</p>
            )}
          </div>

          <div className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-2 font-semibold">Description</h2>
            <p className="whitespace-pre-line text-gray-700 dark:text-slate-200">
              {display.description || "No description provided."}
            </p>
          </div>

          <div className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 font-semibold">Seller</h3>
            <div className="space-y-1 text-gray-700 dark:text-slate-200">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Name:</span>
                <span>{seller.name || "Private Seller"}</span>
                {/* Render @username as plain text to ensure only ONE store navigation element exists */}
                <span className="text-sm text-[#39a0ca]">@{seller.username ?? storeSlug}</span>
              </p>
              {seller.location && (
                <p>
                  <span className="font-medium">Location:</span> {seller.location}
                </p>
              )}
              {seller.memberSince && (
                <p>
                  <span className="font-medium">Member since:</span> {seller.memberSince}
                </p>
              )}
              {typeof seller.rating === "number" && (
                <p>
                  <span className="font-medium">Rating:</span> {seller.rating} / 5
                </p>
              )}
              {typeof seller.sales === "number" && (
                <p>
                  <span className="font-medium">Completed sales:</span> {seller.sales}
                </p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {/* Only render Contact modal when we truly have a product id */}
              {displayMaybe?.id && (
                <ContactModal
                  className="rounded-lg"
                  productId={display.id}
                  productName={display.name}
                  fallbackName={seller.name}
                  fallbackLocation={seller.location}
                  buttonLabel="Show Contact"
                />
              )}

              {/* Always-visible, testable button */}
              <button
                type="button"
                className="rounded-lg border px-5 py-3 font-semibold hover:bg-gray-50 dark:hover:bg-slate-800"
                onClick={() => setShowMessage(true)}
                aria-haspopup="dialog"
                aria-controls="msg-dialog"
              >
                Message seller
              </button>

              {/* The single store navigation element (fallbacks to /store/unknown) */}
              <Link
                href={storeHref}
                className="rounded-lg border px-5 py-3 font-semibold hover:bg-gray-50 dark:hover:bg-slate-800"
                title="Visit store"
                aria-label="Visit store"
              >
                Visit Store
              </Link>

              {display.featured && (
                <div className="ml-auto inline-flex items-center gap-2 rounded-full bg-[#161748] px-3 py-1 text-xs text-white">
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
      </div>

      {/* Accessible Message Dialog (always opens) */}
      {showMessage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="msg-title"
          id="msg-dialog"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowMessage(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border bg-white p-5 shadow-lg dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h4 id="msg-title" className="text-lg font-semibold">
                Message seller
              </h4>
              <button
                type="button"
                className="rounded p-1 text-sm hover:bg-gray-100 dark:hover:bg-slate-800"
                onClick={() => setShowMessage(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {!isAuthed ? (
              <div className="space-y-3 text-sm">
                <p>You need to sign in to start a chat.</p>
                <Link
                  href={`/signin?redirect=/product/${encodeURIComponent(display.id)}`}
                  className="inline-block rounded bg-[#161748] px-4 py-2 text-white hover:opacity-90"
                >
                  Sign in
                </Link>
              </div>
            ) : !seller.id ? (
              <div className="text-sm text-red-600">Seller is unavailable for messaging.</div>
            ) : (
              <>
                <label htmlFor="msg-text" className="mb-1 block text-sm font-medium">
                  Message
                </label>
                <textarea
                  id="msg-text"
                  rows={4}
                  className="w-full rounded border p-2 text-sm"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                />
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="rounded border px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800"
                    onClick={() => setShowMessage(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded bg-[#161748] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-60"
                    onClick={doSendMessage}
                    disabled={sending}
                  >
                    {sending ? "Sending…" : "Send"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
