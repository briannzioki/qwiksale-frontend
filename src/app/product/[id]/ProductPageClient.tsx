// src/app/product/[id]/ProductPageClient.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import toast from "react-hot-toast";
import { useProducts } from "@/app/lib/productsStore";
import FavoriteButton from "@/app/components/favorites/FavoriteButton";
import DeleteListingButton from "@/app/components/DeleteListingButton";
import { buildProductSeo } from "@/app/lib/seo";
import Gallery from "@/app/components/Gallery";
import ContactModal from "@/app/components/ContactModal";

/* -------------------------- Wire type (exported) ------------------------- */
export type ProductWire = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;
  brand?: string | null;
  condition?: string | null;
  price?: number | null;
  image?: string | null;
  gallery?: string[];
  location?: string | null;
  negotiable?: boolean;
  featured?: boolean;
  status?: string | null;
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
  sellerUsername?: string | null;
  username?: string | null;
};

/* -------------------------------- Types -------------------------------- */
type ProductFromStore =
  ReturnType<typeof useProducts> extends { products: infer U }
    ? U extends (infer V)[]
      ? V
      : never
    : never;

type FetchedProduct = Partial<ProductFromStore> & ProductWire;

/* ------------------------------- Constants ------------------------------ */
const GALLERY_SIZES = "(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 800px";

/* ------------------------------- Utilities ------------------------------ */
function fmtKES(n?: number | null) {
  if (typeof n !== "number" || n <= 0) return "Contact for price";
  try {
    return `KES ${new Intl.NumberFormat("en-KE").format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

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

/* -------------------------------- Client -------------------------------- */
export default function ProductPageClient({
  id,
  initialData,
}: {
  id: string;
  initialData: ProductWire | null;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const isAuthed = Boolean(session?.user);

  const { products } = useProducts();

  // SSR data ensures gallery URLs exist on first paint
  const [fetched, setFetched] = useState<FetchedProduct | null>(
    (initialData as unknown as FetchedProduct) ?? null
  );
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [gone, setGone] = useState(!initialData);

  const [origin, setOrigin] = useState<string>("");
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  // Shallow store card for additional hints
  const product = useMemo(() => {
    if (!id) return undefined;
    const p = products.find((x: any) => String(x.id) === String(id)) as
      | ProductFromStore
      | undefined;
    return (p as FetchedProduct) || undefined;
  }, [products, id]);

  // Fetch (once) on client to refresh data if SSR was missing/old
  useEffect(() => {
    if (!id || fetching || fetched) return;
    let cancelled = false;

    (async () => {
      try {
        setFetching(true);
        setFetchErr(null);
        const r = await fetch(`/api/products/${encodeURIComponent(id)}`, {
          cache: "no-store",
          credentials: "include",
          headers: { Accept: "application/json" },
        });

        if (r.status === 404) {
          if (!cancelled) setGone(true);
          return;
        }
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || `Failed to load (${r.status})`);

        const maybe =
          ((j && (("product" in j ? (j as any).product : j) as FetchedProduct)) || null);
        const status = (maybe as any)?.status;

        if (status && String(status).toUpperCase() !== "ACTIVE") {
          if (!cancelled) setGone(true);
          return;
        }

        if (!cancelled) {
          setFetched(maybe);
          setGone(false);
        }
      } catch (e: any) {
        if (!cancelled) setFetchErr(e?.message || "Failed to load product");
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, fetching, fetched]);

  // Quick guard if store has a non-active status
  useEffect(() => {
    const status = (product as any)?.status;
    if (status && String(status).toUpperCase() !== "ACTIVE") {
      setGone(true);
    }
  }, [product]);

  if (gone) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto mb-3 grid h-10 w-10 place-content-center rounded-lg bg-[#161748] text-white">
            404
          </div>
          <h1 className="text-lg font-semibold">Listing unavailable</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">
            This product was removed or isn’t available anymore.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Link href="/" prefetch={false} className="btn-gradient-primary">
              Home
            </Link>
            <Link href="/search" prefetch={false} className="btn-gradient-primary">
              Browse more
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Prefer fetched detail over shallow store item
  const displayMaybe = (fetched || product) as FetchedProduct | undefined;

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
    // Keep gallery shell (detail page trusts API gallery directly)
    gallery: Array.isArray(displayMaybe?.gallery) ? displayMaybe!.gallery : [],
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
    status: displayMaybe?.status ?? null,
    sellerUsername: displayMaybe?.sellerUsername ?? null,
    username: displayMaybe?.username ?? null,
  };

  // Pass API gallery straight to <Gallery />
  const apiGallery = useMemo(() => {
    const g = Array.isArray(displayMaybe?.gallery) ? displayMaybe!.gallery : [];
    return g.map((u) => (u ?? "").toString().trim()).filter(Boolean);
  }, [displayMaybe]);

  const enableLightbox = apiGallery.length > 0;

  // SEO (skip placeholder-only)
  const seo = useMemo(() => {
    const nonPlaceholder =
      apiGallery.length > 0
        ? apiGallery
        : display.image
        ? [display.image]
        : [];
    const args: Parameters<typeof buildProductSeo>[0] = {
      id: display.id,
      name: display.name,
      ...(display.description != null ? { description: display.description } : {}),
      ...(typeof display.price === "number" ? { price: display.price as number | null } : {}),
      ...(nonPlaceholder.length ? { image: nonPlaceholder } : {}),
      ...(display.brand ? { brand: display.brand } : {}),
      ...(display.category ? { category: display.category } : {}),
      ...(display.condition ? { condition: display.condition } : {}),
      status: "ACTIVE",
      urlPath: `/product/${display.id}`,
    };
    return buildProductSeo(args);
  }, [display, apiGallery]);

  const seller = useMemo(() => {
    const nested: any = (display as any)?.seller || {};
    const username =
      [nested?.username, (display as any)?.sellerUsername, (display as any)?.username]
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .find(Boolean) || null;

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

  const isOwner =
    Boolean((session?.user as any)?.id) &&
    Boolean(seller.id) &&
    (session?.user as any)?.id === seller.id;

  const [showMessage, setShowMessage] = useState(false);
  const [messageText, setMessageText] = useState(
    () =>
      `Hi ${seller.name || "there"}, I'm interested in "${
        display?.name ?? "your listing"
      }".`
  );
  const [sending, setSending] = useState(false);

  const copyLink = useCallback(async () => {
    if (!origin || !display?.id) return;
    try {
      await navigator.clipboard.writeText(`${origin}/product/${display.id}`);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  }, [origin, display?.id]);

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
      await startThread(seller.id!, "product", display.id, messageText);
    } finally {
      setSending(false);
    }
  }, [display, seller.id, isAuthed, messageText]);

  // Deterministic store slug & always render Visit Store
  const storeSlug =
    (seller.username && seller.username.trim()) ||
    (seller.id ? `u-${String(seller.id).slice(0, 8)}` : "unknown");

  return (
    <>
      {seo?.jsonLd && (
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(seo.jsonLd) }}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Media */}
        <div className="lg:col-span-3">
          <div
            className="relative overflow-hidden rounded-xl border bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
            data-gallery-wrap
          >
            <div className="relative aspect-[4/3] sm:aspect-[16/10]">
              {display.featured && (
                <span className="absolute left-3 top-3 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs text-white shadow">
                  Featured
                </span>
              )}

              {/* Pass API gallery straight; Gallery handles placeholder fallback */}
              <Gallery images={apiGallery} lightbox={enableLightbox} sizes={GALLERY_SIZES} />

              {/* Hidden mirror so tests can read exact URLs even if hydration races */}
              {apiGallery.length > 0 && (
                <ul hidden data-gallery-shadow>
                  {apiGallery.map((src, i) => (
                    <li key={`shadow:${i}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" data-gallery-image />
                    </li>
                  ))}
                </ul>
              )}

              <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-black/5 dark:ring-white/10" />
            </div>

            {/* Action buttons overlay */}
            <div className="absolute right-3 top-3 z-20 flex gap-2">
              <button
                onClick={copyLink}
                className="btn-gradient-primary inline-flex items-center gap-1 px-2 py-1 text-xs"
                title="Copy link"
                aria-label="Copy link"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M10.5 13.5l3-3M7 17a4 4 0 010-6l3-3a4 4 0 016 6l-1 1"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Copy
              </button>

              {display?.id && (
                <>
                  <FavoriteButton productId={display.id} />
                  {isOwner && (
                    <>
                      <Link
                        href={`/product/${display.id}/edit`}
                        className="btn-gradient-primary inline-flex items-center gap-1 px-2 py-1 text-xs"
                        title="Edit listing"
                        aria-label="Edit listing"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M4 20h4l10-10a2.828 2.828 0 10-4-4L4 16v4z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        Edit
                      </Link>
                      <DeleteListingButton
                        productId={display.id}
                        productName={display.name}
                        className="btn-gradient-primary px-2 py-1 text-xs"
                        label="Delete"
                        onDeletedAction={() => {
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
            {display.condition && <p className="text-sm text-gray-500">Condition: {display.condition}</p>}
            {display.location && <p className="text-sm text-gray-500">Location: {display.location}</p>}
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
                <span className="text-sm text-[#39a0ca]">@{storeSlug}</span>
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
              {display?.id && (
                <ContactModal
                  className="btn-gradient-primary"
                  productId={display.id}
                  productName={display.name}
                  fallbackName={seller.name}
                  fallbackLocation={seller.location}
                  buttonLabel="Show Contact"
                />
              )}

              <button
                type="button"
                className="btn-gradient-primary"
                onClick={() => setShowMessage(true)}
                aria-haspopup="dialog"
                aria-controls="msg-dialog"
                title="Message seller"
              >
                Message seller
              </button>

              {/* Always render Visit Store with fallback slug */}
              <Link
                href={`/store/${storeSlug}`}
                className="btn-gradient-primary"
                title={`Visit @${storeSlug}'s store`}
                aria-label="Visit Store"
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

      {/* Accessible Message Dialog */}
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
                className="btn-gradient-primary px-2 py-1 text-xs"
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
                  href={`/signin?callbackUrl=${encodeURIComponent(`/product/${display.id}`)}`}
                  className="btn-gradient-primary inline-block"
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
                    className="btn-gradient-primary"
                    onClick={() => setShowMessage(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-gradient-primary disabled:opacity-60"
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
