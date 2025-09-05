// src/app/(store)/listing/[id]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/prisma";

type Listing = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  price: number | null;
  image: string | null;
  gallery: string[];
  location: string | null;
  condition: string | null;
};

async function getListing(id: string): Promise<Listing | null> {
  if (!id) return null;
  const p = await prisma.product.findFirst({
    where: { id, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      price: true,
      image: true,
      gallery: true,
      location: true,
      condition: true,
    },
  });
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    category: p.category,
    price: p.price ?? null,
    image: p.image ?? null,
    gallery: Array.isArray(p.gallery) ? p.gallery : [],
    location: p.location ?? null,
    condition: p.condition ?? null,
  };
}

/** Next 15 types expect params as a Promise — await it */
export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) return { title: "Listing not found • QwikSale" };

  const priceTxt = typeof listing.price === "number" ? `KSh ${listing.price}` : "Price on request";
  const town = listing.location ? ` — ${listing.location}` : "";
  const images = [listing.image, ...listing.gallery].filter(Boolean) as string[];

  return {
    title: `${listing.name} • ${priceTxt}${town}`,
    description: listing.description ?? undefined,
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: [product.image, ...(product.gallery || [])].filter(Boolean),
    description: product.description ?? undefined,
    category: product.category,
    offers: {
      "@type": "Offer",
      priceCurrency: "KES",
      price: typeof product.price === "number" ? String(product.price) : undefined,
      availability: "https://schema.org/InStock",
    },
    areaServed: product.location ?? undefined,
    itemCondition:
      product.condition?.toLowerCase().includes("brand")
        ? "https://schema.org/NewCondition"
        : "https://schema.org/UsedCondition",
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="p-4">
        <h1 className="text-xl font-semibold">{product.name}</h1>
        {typeof product.price === "number" && (
          <p className="mt-1 text-gray-700">KSh {product.price}</p>
        )}
        {product.location && (
          <p className="text-gray-600">Location: {product.location}</p>
        )}
      </div>
    </>
  );
}
