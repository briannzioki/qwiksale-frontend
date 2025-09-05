export function canonicalFor(pathname: string, searchParams?: URLSearchParams) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://qwiksale.sale";
  // For filtered listing pages, keep stable keys only
  const keys = ["q","category","location","min","max","sort"];
  const sp = new URLSearchParams();
  keys.forEach(k => { const v = searchParams?.get(k); if (v) sp.set(k, v); });
  const qs = sp.toString();
  return qs ? `${base}${pathname}?${qs}` : `${base}${pathname}`;
}

export function productJsonLd(p: {
  id: string; name: string; description?: string; price?: number; currency?: string; image?: string; url?: string;
}) {
  return {
    "@context":"https://schema.org",
    "@type":"Product",
    "@id": p.url || `${(process.env.NEXT_PUBLIC_SITE_URL||"https://qwiksale.sale")}/products/${p.id}`,
    name: p.name,
    description: p.description,
    image: p.image ? [p.image] : undefined,
    offers: p.price ? { "@type":"Offer", price: p.price, priceCurrency: p.currency || "KES", availability: "https://schema.org/InStock" } : undefined
  };
}
