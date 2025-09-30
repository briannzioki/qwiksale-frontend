// src/app/(store)/service-listing/[id]/page.tsx
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

type Service = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  subcategory?: string | null;
  price: number | null;
  image: string | null;
  gallery: string[];
  location: string | null;
  featured?: boolean | null;
  rateType?: "hour" | "day" | "fixed" | null;
  availability?: string | null;
  serviceArea?: string | null;
  seller: Seller | null;
};

const PLACEHOLDER = "/placeholder/default.jpg";

/** Absolute base URL for server contexts (prod/preview/dev) */
const BASE = (
  process.env["NEXT_PUBLIC_APP_URL"] ||
  (process.env["VERCEL_URL"] ? `https://${process.env["VERCEL_URL"]}` : "http://localhost:3000")
).replace(/\/+$/, "");

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || n <= 0) return "Contact for quote";
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

function rateSuffix(rt?: Service["rateType"]) {
  if (rt === "hour") return "/hr";
  if (rt === "day") return "/day";
  return "";
}

async function getService(id: string): Promise<Service | null> {
  if (!id) return null;
  const s = await prisma.service.findFirst({
    where: { id, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      subcategory: true,
      price: true,
      image: true,
      gallery: true, // ← include gallery
      location: true,
      featured: true,
      rateType: true,
      availability: true,
      serviceArea: true,
      seller: { select: { id: true, username: true, name: true, image: true } },
    },
  });
  if (!s) return null;
  return {
    id: s.id,
    name: s.name,
    description: s.description ?? null,
    category: s.category ?? null,
    subcategory: s.subcategory ?? null,
    price: s.price ?? null,
    image: s.image ?? null,
    gallery: Array.isArray(s.gallery) ? s.gallery : [], // ← normalize
    location: s.location ?? null,
    featured: s.featured ?? null,
    rateType: (s.rateType as Service["rateType"]) ?? null,
    availability: s.availability ?? null,
    serviceArea: s.serviceArea ?? null,
    seller: s.seller
      ? {
          id: s.seller.id,
          username: s.seller.username ?? null,
          name: s.seller.name ?? null,
          image: s.seller.image ?? null,
        }
      : null,
  };
}

/* ---------------- Metadata ---------------- */
export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const svc = await getService(id);
  if (!svc) {
    return { title: "Service not found • QwikSale", robots: { index: false, follow: false } };
  }

  const priceTxt = fmtKES(svc.price);
  const suffix = rateSuffix(svc.rateType);
  const town = svc.serviceArea || svc.location ? ` — ${svc.serviceArea || svc.location}` : "";
  const title = `${svc.name} • ${priceTxt}${suffix}${town}`;
  const images = Array.from(new Set([svc.image, ...(svc.gallery ?? [])].filter(Boolean) as string[]));
  const ogImg = images.length ? images : [PLACEHOLDER];

  return {
    title,
    description: svc.description ?? undefined,
    alternates: { canonical: `/service/${svc.id}` },
    robots: { index: false, follow: true },
    openGraph: {
      type: "website",
      title: svc.name,
      description: svc.description ?? undefined,
      images: ogImg,
    },
    twitter: {
      card: "summary_large_image",
      title: svc.name,
      description: svc.description ?? undefined,
      images: ogImg,
    },
  };
}

/* ---------------- Page ---------------- */
export default async function ServicePage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const svc = await getService(id);
  if (!svc) notFound();

  const images = Array.from(new Set([svc.image, ...(svc.gallery ?? [])].filter(Boolean) as string[]));
  if (images.length === 0) images.push(PLACEHOLDER); // ← guarantee at least one

  const priceTxt = fmtKES(svc.price);
  const suffix = rateSuffix(svc.rateType);
  const sellerName =
    svc.seller?.name || (svc.seller?.username ? `@${svc.seller.username}` : "Provider");
  const serviceType =
    [svc.category, svc.subcategory].filter(Boolean).join(" / ") || undefined;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: svc.name,
    description: svc.description ?? undefined,
    image: images, // ← all images
    serviceType,
    areaServed: svc.serviceArea || svc.location || undefined,
    provider:
      svc.seller?.username || svc.seller?.name
        ? {
            "@type": "Organization",
            name: sellerName,
            url: svc.seller?.username
              ? `${BASE}/store/${encodeURIComponent(svc.seller.username)}`
              : undefined,
          }
        : undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: "KES",
      price: typeof svc.price === "number" ? String(svc.price) : undefined,
      availability: "https://schema.org/InStock",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="container-page py-6">
        <div className="mx-auto max-w-5xl grid gap-6 lg:grid-cols-5">
          {/* Visual */}
          <section className="lg:col-span-3 space-y-3">
            <div
              className="relative overflow-hidden rounded-xl border bg-white shadow-sm"
              data-gallery-wrap
            >
              {/* Keep badge under the Gallery's overlay (Gallery uses z-[60]) */}
              {svc.featured && (
                <span className="absolute left-3 top-3 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs font-semibold text-white shadow">
                  Verified
                </span>
              )}

              {/* Gallery renders images and its own opener */}
              <Gallery images={images} lightbox />

              {/* Explicit full-surface overlay so tests can always click it.
                  We forward the click to Gallery's real opener to preserve UX. */}
              <button
                type="button"
                aria-label="Open image in fullscreen"
                aria-haspopup="dialog"
                className="absolute inset-0 z-[70] cursor-zoom-in bg-transparent"
                data-gallery-overlay
              />

              {/* Click-forwarder script (runs in the browser) */}
              <script
                dangerouslySetInnerHTML={{
                  __html: `
(function(){
  // Delegate: forward clicks from our overlay to Gallery's built-in opener
  document.addEventListener('click', function(e){
      var t = e.target;
      if (!t || !(t instanceof Element)) return;
      if (!t.matches('[data-gallery-overlay]')) return;
      var wrap = t.closest('[data-gallery-wrap]');
      if (!wrap) return;
      var real = wrap.querySelector('button[aria-label="Open image in fullscreen"]');
      if (real && real !== t) { real.click(); }
  }, { capture: true });
})();
                  `.trim()
                }}
              />
            </div>
          </section>

          {/* Details / CTA */}
          <aside className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl border p-4">
              <h1 className="text-xl font-semibold">{svc.name}</h1>
              <div className="mt-1 text-gray-700">
                {priceTxt}
                {suffix && <span className="opacity-80"> {suffix}</span>}
              </div>

              {(svc.serviceArea || svc.location) && (
                <div className="text-gray-600 mt-1">
                  Area: {svc.serviceArea || svc.location}
                </div>
              )}
              {svc.availability && (
                <div className="text-gray-600">Availability: {svc.availability}</div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={`/api/services/${svc.id}/contact`}
                  className="rounded-xl bg-[#161748] px-4 py-2 text-white hover:opacity-90"
                >
                  Reveal contact
                </a>
                <a
                  href={`https://wa.me/254000000000?text=${encodeURIComponent(
                    `Hi! I'm interested in your service "${svc.name}".`
                  )}`}
                  className="rounded-xl border px-4 py-2 hover:bg-gray-50"
                  target="_blank"
                  rel="noreferrer"
                >
                  Message on WhatsApp
                </a>
              </div>
            </div>

            {/* Provider card */}
            {svc.seller && (
              <div className="rounded-2xl border p-4 flex items-center gap-3">
                <UserAvatar
                  src={svc.seller.image}
                  alt={`${sellerName} avatar`}
                  size={44}
                  ring
                  fallbackText={(sellerName || "P").slice(0, 1).toUpperCase()}
                />
                <div className="min-w-0">
                  <div className="font-medium truncate">{sellerName}</div>
                  {svc.seller.username ? (
                    <Link
                      href={`/store/${encodeURIComponent(svc.seller.username)}`}
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

            {svc.description && (
              <div className="rounded-2xl border p-4">
                <h2 className="font-semibold mb-2">Description</h2>
                <p className="whitespace-pre-wrap text-gray-800">{svc.description}</p>
              </div>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}
