// src/app/(store)/listing/[id]/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/prisma";

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
  };
}

/** Next 15 expects params as a Promise — await it */
export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) return { title: "Listing not found • QwikSale" };

  const priceTxt = fmtKES(listing.price);
  const town = listing.location ? ` — ${listing.location}` : "";

  // unique, truthy images for OG/Twitter
  const images = Array.from(
    new Set([listing.image, ...(listing.gallery || [])].filter(Boolean) as string[])
  );

  return {
    title: `${listing.name} • ${priceTxt}${town}`,
    description: listing.description ?? undefined,
    alternates: { canonical: `/listing/${listing.id}` },
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

  // unique images, with placeholder fallback for UI
  const images = Array.from(
    new Set([product.image, ...(product.gallery || [])].filter(Boolean) as string[])
  );
  const hero = images[0] ?? PLACEHOLDER;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: images.length ? images : [PLACEHOLDER],
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
    areaServed: product.location ?? undefined,
    itemCondition: product.condition?.toLowerCase().includes("brand")
      ? "https://schema.org/NewCondition"
      : "https://schema.org/UsedCondition",
  };

  return (
    <>
      {/* JSON-LD for richer snippets */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="container-page py-6">
        <div className="mx-auto max-w-5xl grid gap-6 lg:grid-cols-5">
          {/* Gallery */}
          <section className="lg:col-span-3 space-y-3">
            <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-gray-100">
              <Image
                src={hero}
                alt={product.name}
                fill
                sizes="(max-width: 1024px) 100vw, 768px"
                className="object-cover"
                priority
              />
            </div>

            {images.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {images.slice(1, 5).map((src, i) => (
                  <div
                    key={src + i}
                    className="relative aspect-square overflow-hidden rounded-lg bg-gray-100"
                  >
                    <Image
                      src={src}
                      alt={`${product.name} ${i + 2}`}
                      fill
                      sizes="(max-width: 1024px) 25vw, 180px"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
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
              {product.featured && (
                <div className="mt-2 inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  Verified seller
                </div>
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

            {product.description && (
              <div className="rounded-2xl border p-4">
                <h2 className="font-semibold mb-2">Description</h2>
                <p className="whitespace-pre-wrap text-gray-800">
                  {product.description}
                </p>
              </div>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}
