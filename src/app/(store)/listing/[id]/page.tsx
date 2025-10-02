// src/app/(store)/listing/[id]/page.tsx
export const revalidate = 300;
export const runtime = "nodejs";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import UserAvatar from "@/app/components/UserAvatar";
import Gallery from "@/app/components/Gallery";

type Seller = {
  id: string;
  username: string | null;
  name: string | null;
  image: string | null;
};

type Listing = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  subcategory?: string | null;
  price: number | null;
  image: string | null;
  gallery: string[];
  location: string | null;
  condition: string | null;
  featured?: boolean | null;
  seller: Seller | null;
};

const PLACEHOLDER = "/placeholder/default.jpg";

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || n <= 0) return "Price on request";
  try {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `KSh ${n}`;
  }
}

async function getListing(id: string): Promise<Listing | null> {
  if (!id) return null;
  const p = await prisma.product.findFirst({
    where: { id, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      subcategory: true,
      price: true,
      image: true,
      gallery: true,
      location: true,
      condition: true,
      featured: true,
      seller: {
        select: { id: true, username: true, name: true, image: true },
      },
    },
  });
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    category: p.category,
    subcategory: p.subcategory ?? null,
    price: p.price ?? null,
    image: p.image ?? null,
    gallery: Array.isArray(p.gallery) ? p.gallery : [],
    location: p.location ?? null,
    condition: p.condition ?? null,
    featured: p.featured ?? null,
    seller: p.seller
      ? {
          id: p.seller.id,
          username: p.seller.username ?? null,
          name: p.seller.name ?? null,
          image: p.seller.image ?? null,
        }
      : null,
  };
}

/** Next 15 expects params as a Promise — await it */
export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) {
    return { title: "Listing not found • QwikSale", robots: { index: false, follow: false } };
  }

  const priceTxt = fmtKES(listing.price);
  const town = listing.location ? ` — ${listing.location}` : "";
  const images = Array.from(
    new Set([listing.image, ...(listing.gallery || [])].filter(Boolean) as string[])
  );

  return {
    title: `${listing.name} • ${priceTxt}${town}`,
    description: listing.description ?? undefined,
    alternates: { canonical: `/product/${listing.id}` },
    robots: { index: false, follow: true },
    openGraph: {
      type: "website",
      title: listing.name,
      description: listing.description ?? undefined,
      images: images.length ? images : undefined,
    },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title: listing.name,
      description: listing.description ?? undefined,
      images: images.length ? images : undefined,
    },
  };
}

export default async function ListingPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const product = await getListing(id);
  if (!product) notFound();

  // Always guarantee at least one image (placeholder fallback)
  const images = Array.from(
    new Set([product.image, ...(product.gallery || [])].filter(Boolean) as string[])
  );
  const galleryImages = images.length ? images : [PLACEHOLDER];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: galleryImages,
    description: product.description ?? undefined,
    category:
      [product.category, product.subcategory].filter(Boolean).join(" / ") ||
      product.category,
    offers: {
      "@type": "Offer",
      priceCurrency: "KES",
      price: typeof product.price === "number" ? String(product.price) : undefined,
      availability: "https://schema.org/InStock",
    },
  };

  const sellerName =
    product.seller?.name || (product.seller?.username ? `@${product.seller.username}` : "Seller");

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="container-page py-6">
        <div className="mx-auto max-w-5xl grid gap-6 lg:grid-cols-5">
          {/* Gallery (with overlay button & Esc-to-close) */}
          <section className="lg:col-span-3 space-y-3">
            <div className="relative overflow-hidden rounded-xl border bg-white shadow-sm">
              {product.featured && (
                <span className="absolute left-3 top-3 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs font-semibold text-white shadow">
                  Verified seller
                </span>
              )}
              {/* The Gallery provides the full-surface overlay button (aria-label="Open image in fullscreen") */}
              <Gallery images={galleryImages} lightbox />
            </div>
          </section>

          {/* Details / CTA */}
          <aside className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl border p-4">
              <h1 className="text-xl font-semibold">{product.name}</h1>
              <div className="mt-1 text-gray-700">{fmtKES(product.price)}</div>
              {product.location && (
                <div className="text-gray-600 mt-1">Location: {product.location}</div>
              )}
              {product.condition && (
                <div className="text-gray-600">Condition: {product.condition}</div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={`/api/products/${product.id}/contact`}
                  className="rounded-xl bg-[#161748] px-4 py-2 text-white hover:opacity-90"
                >
                  Reveal contact
                </a>
                <a
                  href={`https://wa.me/254000000000?text=${encodeURIComponent(
                    `Hi! Is "${product.name}" still available?`
                  )}`}
                  className="rounded-xl border px-4 py-2 hover:bg-gray-50"
                  target="_blank"
                  rel="noreferrer"
                >
                  Message on WhatsApp
                </a>
              </div>
            </div>

            {/* Seller card */}
            {product.seller && (
              <div className="rounded-2xl border p-4 flex items-center gap-3">
                <UserAvatar
                  src={product.seller.image}
                  alt={`${sellerName} avatar`}
                  size={44}
                  ring
                  fallbackText={(sellerName || "S").slice(0, 1).toUpperCase()}
                />
                <div className="min-w-0">
                  <div className="font-medium truncate">{sellerName}</div>
                  {product.seller.username ? (
                    <Link
                      href={`/store/${encodeURIComponent(product.seller.username)}`}
                      className="text-sm text-[#161748] underline underline-offset-2"
                    >
                      Visit store
                    </Link>
                  ) : (
                    <span className="text-sm text-gray-500">Store</span>
                  )}
                </div>
              </div>
            )}

            {product.description && (
              <div className="rounded-2xl border p-4">
                <h2 className="font-semibold mb-2">Description</h2>
                <p className="whitespace-pre-wrap text-gray-800">{product.description}</p>
              </div>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}
