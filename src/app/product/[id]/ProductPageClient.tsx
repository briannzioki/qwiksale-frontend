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
import { extractGalleryUrls } from "@/app/lib/media";

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

type StoreRow =
  ReturnType<typeof useProducts> extends { products: infer U }
    ? U extends (infer V)[]
      ? V
      : never
    : never;

type Detail = Partial<StoreRow> & ProductWire;

const GALLERY_SIZES =
  "(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 800px";

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || n <= 0) return "Contact for price";
  try {
    return `KES ${new Intl.NumberFormat("en-KE").format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

export default function ProductPageClient({
  id,
  initialData,
}: {
  id: string;
  initialData: ProductWire | null;
}) {
  const router = useRouter();
  const { data: session } = useSession();

  const { products } = useProducts();

  const [fetched, setFetched] = useState<Detail | null>(
    (initialData as unknown as Detail) ?? null,
  );
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [gone, setGone] = useState(false);

  const product = useMemo(() => {
    if (!id) return undefined;
    const p = products.find(
      (x: any) => String(x.id) === String(id),
    ) as StoreRow | undefined;
    return (p as Detail) || undefined;
  }, [products, id]);

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
          (j && (("product" in j ? (j as any).product : j) as Detail)) || null;
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

  useEffect(() => {
    const status = (product as any)?.status;
    if (status && String(status).toUpperCase() !== "ACTIVE") {
      setGone(true);
    }
  }, [product]);

  if (gone) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 grid h-10 w-10 place-content-center rounded-lg bg-[#161748] text-white">
            404
          </div>
          <h1 className="text-lg font-semibold">Listing unavailable</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This product was removed or isn’t available anymore.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Link href="/" prefetch={false} className="btn-gradient-primary">
              Home
            </Link>
            <Link
              href="/search"
              prefetch={false}
              className="btn-gradient-primary"
            >
              Browse more
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const displayMaybe = (fetched || product) as Detail | undefined;

  const display: Detail = {
    id: displayMaybe?.id ?? (id || "unknown"),
    name: displayMaybe?.name ?? "Listing",
    category: displayMaybe?.category ?? "General",
    subcategory: displayMaybe?.subcategory ?? "General",
    description: displayMaybe?.description ?? null,
    brand: displayMaybe?.brand ?? null,
    condition: displayMaybe?.condition ?? null,
    price: typeof displayMaybe?.price === "number" ? displayMaybe?.price : null,
    image: displayMaybe?.image ?? null,
    gallery: Array.isArray(displayMaybe?.gallery)
      ? displayMaybe!.gallery
      : [],
    location: displayMaybe?.location ?? null,
    negotiable: Boolean(displayMaybe?.negotiable),
    featured: Boolean(displayMaybe?.featured),
    sellerId: displayMaybe?.sellerId ?? null,
    sellerName: displayMaybe?.sellerName ?? null,
    sellerPhone: displayMaybe?.sellerPhone ?? null,
    sellerLocation: displayMaybe?.sellerLocation ?? null,
    sellerMemberSince: displayMaybe?.sellerMemberSince ?? null,
    sellerRating:
      typeof displayMaybe?.sellerRating === "number"
        ? displayMaybe?.sellerRating
        : null,
    sellerSales:
      typeof displayMaybe?.sellerSales === "number"
        ? displayMaybe?.sellerSales
        : null,
    seller: displayMaybe?.seller ?? null,
    status: displayMaybe?.status ?? null,
    sellerUsername: displayMaybe?.sellerUsername ?? null,
    username: displayMaybe?.username ?? null,
  };

  const apiGallery = useMemo(
    () =>
      extractGalleryUrls(
        displayMaybe ?? {},
        displayMaybe?.image || "/og.png",
      ),
    [displayMaybe],
  );

  const enableLightbox = apiGallery.length > 0;

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
          ? display?.sellerRating
          : null,
      sales:
        typeof nested?.sales === "number"
          ? nested.sales
          : typeof display?.sellerSales === "number"
          ? display?.sellerSales
          : null,
    };
  }, [display]);

  const isOwner =
    Boolean((session?.user as any)?.id) &&
    Boolean(seller.id) &&
    (session?.user as any)?.id === seller.id;

  const [fetchCopying, setFetchCopying] = useState(false);

  const copyLink = useCallback(async () => {
    if (!display?.id || fetchCopying) return;
    try {
      setFetchCopying(true);
      const shareUrl =
        typeof window !== "undefined" && window.location
          ? `${window.location.origin}/product/${display.id}`
          : `/product/${display.id}`;
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy link");
    } finally {
      setFetchCopying(false);
    }
  }, [display?.id, fetchCopying]);

  const seo = useMemo(() => {
    const nonPlaceholder =
      apiGallery.length > 0
        ? apiGallery
        : display.image
        ? [display.image]
        : [];
    const args: Parameters<typeof buildProductSeo>[0] = {
      id: display.id!,
      name: display.name!,
      ...(display.description != null
        ? { description: display.description }
        : {}),
      ...(typeof display.price === "number"
        ? { price: display.price as number | null }
        : {}),
      ...(nonPlaceholder.length ? { image: nonPlaceholder } : {}),
      ...(display.brand ? { brand: display.brand } : {}),
      ...(display.category ? { category: display.category } : {}),
      ...(display.condition ? { condition: display.condition } : {}),
      status: "ACTIVE",
      urlPath: `/product/${display.id}`,
    };
    return buildProductSeo(args);
  }, [display, apiGallery]);

  const storeSlug = useMemo(() => {
    const u =
      seller.username ||
      display.sellerUsername ||
      (display as any)?.username ||
      null;
    const sid =
      display.sellerId ||
      ((seller.id as string | null) as string | null) ||
      null;
    return u || (sid ? `u-${sid}` : null);
  }, [
    seller.username,
    display.sellerUsername,
    (display as any)?.username,
    display.sellerId,
    seller.id,
  ]);

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
            className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm"
            data-gallery-wrap
          >
            <div
              className="relative aspect-[4/3] sm:aspect-[16/10]"
              data-gallery-overlay="true"
            >
              {display.featured && (
                <span className="absolute left-3 top-3 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs text-white shadow">
                  Featured
                </span>
              )}

              <Gallery
                images={apiGallery}
                lightbox={enableLightbox}
                sizes={GALLERY_SIZES}
              />

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

            {/* Controls */}
            <div className="absolute right-3 top-3 z-20 flex gap-2">
              <button
                onClick={copyLink}
                className="btn-gradient-primary inline-flex items-center gap-1 px-2 py-1 text-xs"
                title="Copy link"
                aria-label="Copy link"
                disabled={fetchCopying}
              >
                {fetchCopying ? "Copying…" : "Copy"}
              </button>

              {display?.id && (
                <>
                  <FavoriteButton productId={display.id!} />
                  {isOwner && (
                    <>
                      <Link
                        href={`/product/${display.id}/edit`}
                        className="btn-gradient-primary inline-flex items-center gap-1 px-2 py-1 text-xs"
                        title="Edit listing"
                        aria-label="Edit listing"
                      >
                        Edit
                      </Link>
                      <DeleteListingButton
                        productId={display.id!}
                        productName={display.name!}
                        className="btn-gradient-primary px-2 py-1 text-xs"
                        label="Delete"
                        onDeletedAction={() => {
                          toast.success("Listing deleted");
                          // ✅ Only after explicit user action
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
              <h1 className="text-2xl font-bold text-foreground">
                {display.name || "Listing"}
              </h1>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {display.category || "General"} •{" "}
                  {display.subcategory || "General"}
                </span>
                {display.featured && (
                  <span className="whitespace-nowrap rounded-full bg-[#161748] px-3 py-1 text-xs font-medium text-white">
                    Verified Seller
                  </span>
                )}
              </div>
              {(fetching || fetchErr) && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {fetching ? "Loading details…" : "Showing limited info"}
                </div>
              )}
            </div>

            {/* Always-visible Visit Store link */}
            <div className="shrink-0">
              {storeSlug && (
                <Link
                  href={`/store/${encodeURIComponent(storeSlug)}`}
                  prefetch={false}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                  aria-label="Visit Store"
                >
                  Visit Store
                </Link>
              )}
            </div>
          </div>

          <div className="space-y-1 rounded-xl border border-border bg-card p-4">
            <p className="text-2xl font-bold text-[#161748] dark:text-brandBlue">
              {fmtKES(display.price)}
            </p>
            {display.negotiable && (
              <p className="text-sm text-muted-foreground">Negotiable</p>
            )}
            {display.brand && (
              <p className="text-sm text-muted-foreground">
                Brand: {display.brand}
              </p>
            )}
            {display.condition && (
              <p className="text-sm text-muted-foreground">
                Condition: {display.condition}
              </p>
            )}
            {display.location && (
              <p className="text-sm text-muted-foreground">
                Location: {display.location}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-2 font-semibold">Description</h2>
            <p className="whitespace-pre-line text-foreground">
              {display.description || "No description provided."}
            </p>
          </div>

          {/* Seller */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 font-semibold">Seller</h3>
            <div className="space-y-1 text-foreground">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Name:</span>
                <span>
                  {display.sellerName ||
                    (display.seller as any)?.name ||
                    "Private Seller"}
                </span>
              </p>
              {seller.location && (
                <p>
                  <span className="font-medium">Location:</span>{" "}
                  {seller.location}
                </p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {display?.id && (
                <ContactModal
                  className="btn-gradient-primary"
                  productId={display.id!}
                  productName={display.name!}
                  fallbackName={seller.name}
                  fallbackLocation={seller.location}
                  /** Keep the label exactly as tests expect */
                  buttonLabel="Message seller"
                />
              )}
            </div>

            <div className="mt-4 text-xs text-muted-foreground">
              Safety: meet in public places, inspect items carefully, and never
              share sensitive information.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
