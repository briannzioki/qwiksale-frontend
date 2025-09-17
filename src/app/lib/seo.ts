/* -------------------------------------------------------------------------- */
/* Core URL helpers                                                           */
/* -------------------------------------------------------------------------- */

function resolveSiteUrl(): string {
  const raw =
    process.env["NEXT_PUBLIC_SITE_URL"] ||
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["APP_URL"] ||
    "https://qwiksale.sale";

  // trim whitespace & trailing slashes
  const trimmed = String(raw).trim().replace(/\/+$/, "");

  // ensure http(s) scheme to avoid relative/protocol-less values
  if (!/^https?:\/\//i.test(trimmed)) {
    return "https://qwiksale.sale";
  }
  return trimmed;
}

export const SITE_URL = resolveSiteUrl();

/** Ensure path starts with a single leading slash; strip duplicate slashes. */
export function normalizePath(pathname: string): string {
  const p = String(pathname || "/");
  return ("/" + p.replace(/^\/+/, "")).replace(/\/{2,}/g, "/");
}

/** Build absolute URL from pathname (or pass-through absolute). */
export function absUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return SITE_URL + "/";
  try {
    // already absolute?
    const u = new URL(pathOrUrl);
    return u.href;
  } catch {
    return SITE_URL + normalizePath(pathOrUrl);
  }
}

/** Remove tracking/query noise. Optionally keep a whitelist of keys. */
export function cleanedSearchParams(
  source?: URLSearchParams | Record<string, string | number | undefined | null>,
  keepKeys: string[] = []
): URLSearchParams {
  const sp = new URLSearchParams();
  const set = (k: string, v: unknown) => {
    if (v == null) return;
    const s = String(v).trim();
    if (s) sp.set(k, s);
  };

  // Convert record → URLSearchParams
  if (source instanceof URLSearchParams) {
    for (const [k, v] of source.entries()) set(k, v);
  } else if (source && typeof source === "object") {
    for (const k of Object.keys(source)) set(k, (source as any)[k]);
  }

  // Drop common trackers unless explicitly allowed
  const DROP = new Set([
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gclid",
    "fbclid",
    "ref",
    "ref_src",
  ]);
  for (const k of Array.from(sp.keys())) {
    if (DROP.has(k) && !keepKeys.includes(k)) sp.delete(k);
  }

  // If a keep list is provided, filter to it
  if (keepKeys.length) {
    for (const k of Array.from(sp.keys())) {
      if (!keepKeys.includes(k)) sp.delete(k);
    }
  }
  return sp;
}

/**
 * Canonical URL for a page. Keeps only stable filter keys and supports pagination.
 * Example: canonicalFor('/search', searchParams, { page: 2 })
 */
export function canonicalFor(
  pathname: string,
  searchParams?: URLSearchParams | Record<string, string | number | undefined | null>,
  opts?: { page?: number }
) {
  // 🔧 Align with your actual filters used across the site
  const keep = [
    "q",
    "category",
    "subcategory",
    "brand",
    "condition",
    "location",
    "minPrice",
    "maxPrice",
    "sort",
    "featured",
    "rateType",        // "fixed" | "hour" | "day"
    "serviceArea",
    "availability",
  ];
  const sp = cleanedSearchParams(searchParams, keep);

  // Encode pagination canonically (page=1 omitted)
  if (opts?.page && Number(opts.page) > 1) {
    sp.set("page", String(Math.floor(Number(opts.page))));
  } else {
    sp.delete("page");
  }

  const qs = sp.toString();
  return qs ? `${SITE_URL}${normalizePath(pathname)}?${qs}` : `${SITE_URL}${normalizePath(pathname)}`;
}

/* -------------------------------------------------------------------------- */
/* Safe text helpers                                                          */
/* -------------------------------------------------------------------------- */

export function stripHtml(s?: string | null) {
  return (s || "").replace(/<[^>]*>/g, "").trim();
}

export function clampLen(s: string, max = 160) {
  if (!s) return s;
  const clean = s.trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1).trimEnd() + "…";
}

export function safeTitle(s?: string | null, fallback = "QwikSale") {
  const t = stripHtml(s || "").replace(/\s+/g, " ").trim();
  return t || fallback;
}

export function safeDesc(s?: string | null, fallback = "QwikSale — Kenya’s trusted marketplace for all items.") {
  return clampLen(stripHtml(s || "") || fallback, 160);
}

/* -------------------------------------------------------------------------- */
/* JSON-LD builders                                                           */
/* -------------------------------------------------------------------------- */

/** Organization JSON-LD (site-wide) */
export function organizationJsonLd(opts?: {
  name?: string;
  url?: string;
  logo?: string;
  sameAs?: string[];
}) {
  const url = opts?.url || SITE_URL;
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: opts?.name || "QwikSale",
    url,
    logo: opts?.logo || `${SITE_URL}/icon-512.png`,
    sameAs: opts?.sameAs && opts.sameAs.length ? opts.sameAs : undefined,
  };
}

/** WebSite JSON-LD with SearchAction */
export function websiteJsonLd(opts?: { name?: string; url?: string; searchParam?: string }) {
  const url = opts?.url || SITE_URL;
  const qp = opts?.searchParam || "q";
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: opts?.name || "QwikSale",
    url,
    potentialAction: {
      "@type": "SearchAction",
      target: `${url}/?${qp}={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

/** BreadcrumbList JSON-LD */
export function breadcrumbJsonLd(crumbs: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absUrl(c.url),
    })),
  };
}

/** ItemList JSON-LD for category/search pages */
export function itemListJsonLd(items: Array<{ id?: string; name: string; url: string; image?: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: absUrl(p.url),
      item: {
        "@type": "Product",
        name: p.name,
        url: absUrl(p.url),
        ...(p.image ? { image: [p.image] } : {}),
        ...(p.id ? { sku: p.id } : {}),
      },
    })),
  };
}

/** Map common condition/status to schema.org values */
function mapCondition(cond?: string | null) {
  const c = (cond || "").toLowerCase();
  if (c.includes("brand")) return "https://schema.org/NewCondition";
  return "https://schema.org/UsedCondition";
}
function mapAvailability(status?: string | null) {
  const s = (status || "").toUpperCase();
  if (s === "SOLD" || s === "HIDDEN") return "https://schema.org/OutOfStock";
  return "https://schema.org/InStock";
}

/** Product JSON-LD */
export function productJsonLd(p: {
  id: string;
  name: string;
  description?: string | null;
  price?: number | null;
  currency?: string;
  image?: string | string[] | null;
  url?: string;
  brand?: string | null;
  category?: string | null;
  condition?: string | null;
  status?: "ACTIVE" | "SOLD" | "HIDDEN" | "DRAFT" | string | null;
  sellerName?: string | null;
  sellerUrl?: string | null;
  priceValidUntil?: string | Date | null;
  ratingValue?: number | null;
  reviewCount?: number | null;
}) {
  const images = Array.isArray(p.image)
    ? p.image
    : p.image
    ? [p.image]
    : undefined;

  const url = p.url || `${SITE_URL}/product/${encodeURIComponent(p.id)}`;

  const offers =
    typeof p.price === "number" && p.price > 0
      ? {
          "@type": "Offer",
          price: p.price,
          priceCurrency: p.currency || "KES",
          availability: mapAvailability(p.status),
          ...(p.priceValidUntil
            ? { priceValidUntil: new Date(p.priceValidUntil).toISOString() }
            : {}),
          ...(p.sellerName
            ? { seller: { "@type": "Organization", name: p.sellerName, url: p.sellerUrl || SITE_URL } }
            : {}),
        }
      : undefined;

  const aggregateRating =
    typeof p.ratingValue === "number" && typeof p.reviewCount === "number"
      ? {
          "@type": "AggregateRating",
          ratingValue: Math.max(0, Math.min(5, p.ratingValue)),
          reviewCount: Math.max(0, Math.floor(p.reviewCount)),
        }
      : undefined;

  const out: any = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": url,
    name: safeTitle(p.name),
    description: safeDesc(p.description || ""),
    url,
    ...(images ? { image: images } : {}),
    ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}),
    ...(p.id ? { sku: p.id } : {}),
    ...(p.category ? { category: p.category } : {}),
    ...(p.condition ? { itemCondition: mapCondition(p.condition) } : {}),
    ...(offers ? { offers } : {}),
    ...(aggregateRating ? { aggregateRating } : {}),
  };

  return out;
}

/* -------------------------------------------------------------------------- */
/* Open Graph/Twitter helpers (framework-agnostic objects)                    */
/* -------------------------------------------------------------------------- */

export function buildOg(meta: {
  title: string;
  description?: string;
  url?: string;
  image?: string | string[];
  siteName?: string;
}) {
  const images = Array.isArray(meta.image) ? meta.image : meta.image ? [meta.image] : [`${SITE_URL}/og-image.png`];
  const url = meta.url ? absUrl(meta.url) : SITE_URL;
  return {
    title: safeTitle(meta.title),
    description: safeDesc(meta.description || ""),
    url,
    siteName: meta.siteName || "QwikSale",
    images,
    type: "website" as const,
  };
}

export function buildTwitter(meta: {
  title: string;
  description?: string;
  image?: string | string[];
  card?: "summary" | "summary_large_image";
}) {
  const images = Array.isArray(meta.image) ? meta.image : meta.image ? [meta.image] : [`${SITE_URL}/og-image.png`];
  return {
    card: meta.card || "summary_large_image",
    title: safeTitle(meta.title),
    description: safeDesc(meta.description || ""),
    images,
  };
}

/* -------------------------------------------------------------------------- */
/* Page-level convenience                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Build a consistent SEO bundle for a product page (you can adapt to Next Metadata).
 * Returns canonical, og, twitter, and JSON-LD blobs you can drop into your layout.
 */
export function buildProductSeo(p: {
  id: string;
  name: string;
  description?: string | null;
  price?: number | null;
  image?: string | string[] | null;
  brand?: string | null;
  category?: string | null;
  condition?: string | null;
  status?: string | null;
  urlPath?: string; // e.g. `/product/123`
}) {
  const url = p.urlPath ? absUrl(p.urlPath) : `${SITE_URL}/product/${encodeURIComponent(p.id)}`;
  const canonical = url;

  // Only include `image` when defined to satisfy exactOptionalPropertyTypes
  const singleImage = Array.isArray(p.image) ? p.image[0] : p.image || undefined;

  const og = buildOg({
    title: p.name,
    description: p.description || "",
    url,
    ...(singleImage ? { image: singleImage } : {}),
  });

  const twitter = buildTwitter({
    title: p.name,
    description: p.description || "",
    ...(singleImage ? { image: singleImage } : {}),
  });

  // IMPORTANT: Omit keys instead of passing `undefined`
  const jsonLd = productJsonLd({
    id: p.id,
    name: p.name,
    ...(p.description != null ? { description: p.description } : {}),
    ...(typeof p.price === "number" ? { price: p.price } : {}), // no undefined here
    ...(p.image ? { image: p.image } : {}),
    url,
    ...(p.brand ? { brand: p.brand } : {}),
    ...(p.category ? { category: p.category } : {}),
    ...(p.condition ? { condition: p.condition } : {}),
    ...(p.status ? { status: p.status } : {}),
  });

  return { canonical, og, twitter, jsonLd };
}
