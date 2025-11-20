// src/app/product/[id]/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import Gallery from "@/app/components/Gallery";
import ProductActions from "@/app/components/ProductActions";
import ContactModal from "@/app/components/ContactModal";
import { makeApiUrl } from "@/app/lib/url";
import { extractGalleryUrls } from "@/app/lib/media";

/* -------------------------------- Types -------------------------------- */

type ProductWire = {
  id: string;

  name?: string | null;
  description?: string | null;

  image?: string | null;
  images?: unknown;
  gallery?: unknown;
  photos?: unknown;
  media?: unknown;
  imageUrls?: unknown;

  price?: number | null;
  status?: string | null;
  location?: string | null;

  sellerId?: string | null;
  seller?:
    | {
        id?: string;
        username?: string | null;
        name?: string | null;
      }
    | null;

  sellerUsername?: string | null;
  username?: string | null;
  store?: string | null;
  storeSlug?: string | null;
  sellerSlug?: string | null;
};

/* ------------------------------ Utilities ------------------------------ */

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
    return "Contact for price";
  }
  try {
    return `KES ${new Intl.NumberFormat("en-KE").format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

function resolveStoreHref(p: ProductWire | null): string {
  if (!p) return "/store/unknown";

  const username =
    p.sellerUsername ||
    p.username ||
    p.seller?.username ||
    p.storeSlug ||
    p.store ||
    p.sellerSlug ||
    null;

  if (username) {
    return `/store/${encodeURIComponent(username)}`;
  }

  const sellerId =
    p.sellerId ||
    p.seller?.id ||
    (p as any)?.owner?.id ||
    (p as any)?.user?.id ||
    (p as any)?.vendor?.id ||
    null;

  if (sellerId) {
    return `/store/u-${encodeURIComponent(String(sellerId))}`;
  }

  return "/store/unknown";
}

async function fetchInitialProduct(
  id: string,
): Promise<{ product: ProductWire | null; status: number }> {
  try {
    const primaryUrl = makeApiUrl(`/api/products/${encodeURIComponent(id)}`);
    const res = await fetch(primaryUrl, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (res.status === 404) {
      const alt = await fetch(
        makeApiUrl(`/api/products?ids=${encodeURIComponent(id)}`),
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
        },
      ).catch(() => null);

      const altJson = ((await alt?.json().catch(() => null)) || {}) as any;

      const cand = Array.isArray(altJson?.items)
        ? (altJson.items.find(
            (x: any) => String(x?.id) === String(id),
          ) as ProductWire | undefined)
        : null;

      if (cand) {
        return { product: cand, status: 200 };
      }

      return { product: null, status: 404 };
    }

    const json = ((await res.json().catch(() => ({}))) || {}) as any;
    const wire = ((json.product ?? json) || null) as ProductWire | null;

    return { product: wire, status: res.status };
  } catch {
    return { product: null, status: 0 };
  }
}

/* -------------------------------- Page --------------------------------- */

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id || !String(id).trim()) notFound();

  const { product, status } = await fetchInitialProduct(id);
  if (status === 404) notFound();

  const resolvedImages = extractGalleryUrls(
    product ?? {},
    product?.image || "/og.png",
  );
  const images = resolvedImages.length
    ? resolvedImages
    : [product?.image || "/og.png"];

  const storeHref = resolveStoreHref(product);
  const title = product?.name || "Product";
  const priceText = fmtKES(product?.price);

  return (
    <main className="container-page space-y-5 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          Product: {title}
        </h1>
        <Link
          href={storeHref}
          prefetch={false}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
          aria-label="Visit store"
        >
          Visit store
        </Link>
      </div>

      <div className="space-x-3 text-sm text-gray-600 dark:text-slate-300">
        <span>
          ID:{" "}
          <code className="font-mono" data-testid="product-id">
            {id}
          </code>
        </span>
        <span>Price: {priceText}</span>
        {product?.location && <span>Location: {product.location}</span>}
      </div>

      {/* Wrap the gallery so tests can target [data-gallery-wrap] */}
      <div className="relative" data-gallery-wrap>
        <div className="relative aspect-[4/3] sm:aspect-[16/10]">
          <Gallery
            images={images}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 70vw, 960px"
          />

          {/* Hidden mirror so tests can read actual src/currentSrc */}
          <ul hidden data-gallery-shadow="true">
            {images.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <li key={`shadow:${i}`}>
                <img src={src} alt="" data-gallery-image />
              </li>
            ))}
          </ul>

          <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-black/5 dark:ring-white/10" />
        </div>
      </div>

      {product?.description && (
        <section className="prose prose-sm max-w-none dark:prose-invert">
          <p>{product.description}</p>
        </section>
      )}

      <section className="mt-4 flex flex-wrap items-center gap-3">
        <ContactModal
          productId={product?.id || id}
          productName={product?.name || undefined}
          fallbackName={product?.seller?.name || undefined}
          fallbackLocation={product?.location || undefined}
          buttonLabel="Message seller"
          className="min-w-[150px]"
        />
        <Link
          href={storeHref}
          prefetch={false}
          className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
        >
          Visit store
        </Link>
      </section>

      <ProductActions
        kind="product"
        id={product?.id || id}
        storeHref={storeHref}
      />
    </main>
  );
}

export const metadata: Metadata = {
  robots: { index: true, follow: true },
};
