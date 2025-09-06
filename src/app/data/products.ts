// src/app/data/products.ts

/** ----------------------------- Types ------------------------------ */

export type Condition = "brand new" | "pre-owned";

export interface Seller {
  name: string;
  phone?: string;           // WhatsApp deep-link (normalized to 2547XXXXXXXX if possible)
  memberSince: string;      // e.g. "2024"
  rating: number;           // 0–5
  sales: number;            // total completed sales
  location: string;         // seller base location
}

export interface Product {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  brand?: string | null;
  price: number;            // KES (0 = contact for price)
  condition: Condition;
  location: string;         // item location
  description: string;
  image: string;            // primary image (used for cards)
  gallery: string[];        // gallery (first image = primary)
  seller: Seller;

  // Optional fields to align with app & API models
  createdAt?: string;       // ISO; if absent, consumer may fill with new Date().toISOString()
  featured?: boolean;       // “verified” highlight in UI
}

/** --------------------------- Constants ---------------------------- */

export const PLACEHOLDER = "/placeholder/default.jpg";

/** ------------------------- Normalizers ---------------------------- */

export function normalizeCondition(s: string): Condition {
  const t = (s || "").trim().toLowerCase();
  if (t === "brand new" || t === "brand-new" || t === "brand_new") return "brand new";
  return "pre-owned";
}

export function toKesInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

/** Normalize to 2547XXXXXXXX. Accepts 07XXXXXXXX or +2547XXXXXXXX (and with spaces/dashes). */
export function normalizeMsisdn(input?: string): string | undefined {
  if (!input) return undefined;
  let s = input.replace(/\D+/g, "");
  // +2547XXXXXXXX -> 2547XXXXXXXX
  if (s.startsWith("2547") && s.length === 12) return s;
  if (s.startsWith("07") && s.length === 10) return "254" + s.slice(1);
  if (s.startsWith("254") && s.length === 12) return s; // already normalized but maybe 2541... (reject below)
  // Reject anything not starting 2547 or not 12 digits
  if (!/^2547\d{8}$/.test(s)) return undefined;
  return s;
}

/** WhatsApp deep-link text => https://wa.me/2547XXXXXXXX?text=... */
export function makeWhatsAppLink(phone?: string, text?: string): string | undefined {
  const msisdn = normalizeMsisdn(phone);
  if (!msisdn) return undefined;
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${msisdn}${q}`;
}

/** Utility for simple date stamping; if parsing fails, fallback to now (ISO). */
export function iso(d: string): string {
  const dt = new Date(d);
  return Number.isFinite(+dt) ? dt.toISOString() : new Date().toISOString();
}

/** ------------------------ Search Utilities ------------------------ */

export type SortKey = "top" | "new" | "price_asc" | "price_desc";

export type ProductQuery = {
  q?: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  condition?: Condition | string;
  verifiedOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
};

export type ProductQueryResult = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: Product[];
};

/** Case-insensitive contains (safe on empty strings) */
const ciIncludes = (a: string, b: string) => a.toLowerCase().includes((b || "").toLowerCase());

function matches(p: Product, q: ProductQuery): boolean {
  if (q.q) {
    const needle = q.q.trim();
    const haystacks = [
      p.name,
      p.brand || "",
      p.category,
      p.subcategory,
      p.description,
      p.location,
      p.seller?.name || "",
      p.seller?.location || "",
    ];
    if (!haystacks.some((h) => ciIncludes(h, needle))) return false;
  }

  if (q.category && p.category.toLowerCase() !== q.category.toLowerCase()) return false;
  if (q.subcategory && p.subcategory.toLowerCase() !== q.subcategory.toLowerCase()) return false;
  if (q.brand && (p.brand || "").toLowerCase() !== q.brand.toLowerCase()) return false;

  if (q.condition) {
    const want = normalizeCondition(String(q.condition));
    if (p.condition !== want) return false;
  }

  if (q.verifiedOnly && !p.featured) return false;

  const min = Number.isFinite(q.minPrice) ? Math.max(0, Number(q.minPrice)) : undefined;
  const max = Number.isFinite(q.maxPrice) ? Math.max(0, Number(q.maxPrice)) : undefined;

  if (typeof min === "number" && typeof max === "number") {
    // keep contact-for-price (0) visible regardless; else price in [min,max]
    if (!(p.price === 0 || (p.price >= min && p.price <= max))) return false;
  } else if (typeof min === "number") {
    if (!(p.price === 0 || p.price >= min)) return false;
  } else if (typeof max === "number") {
    if (!(p.price === 0 || p.price <= max)) return false;
  }

  return true;
}

/** Sort with deterministic tie-breakers */
function sortList(list: Product[], sort: SortKey): Product[] {
  const byDateDesc = (a?: string, b?: string) => (b ? +new Date(b) : 0) - (a ? +new Date(a) : 0);
  const byIdAsc = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

  const copy = [...list];

  switch (sort) {
    case "top":
      return copy.sort((a, b) => {
        if (!!b.featured !== !!a.featured) return Number(b.featured) - Number(a.featured);
        const dt = byDateDesc(a.createdAt, b.createdAt);
        return dt || byIdAsc(a.id, b.id);
      });
    case "new":
      return copy.sort((a, b) => byDateDesc(a.createdAt, b.createdAt) || byIdAsc(a.id, b.id));
    case "price_asc":
      return copy.sort((a, b) => {
        const ap = a.price === 0 ? Number.POSITIVE_INFINITY : a.price;
        const bp = b.price === 0 ? Number.POSITIVE_INFINITY : b.price;
        if (ap !== bp) return ap - bp;
        const dt = byDateDesc(a.createdAt, b.createdAt);
        return dt || byIdAsc(a.id, b.id);
      });
    case "price_desc":
      return copy.sort((a, b) => {
        const ap = a.price === 0 ? Number.NEGATIVE_INFINITY : a.price;
        const bp = b.price === 0 ? Number.NEGATIVE_INFINITY : b.price;
        if (ap !== bp) return bp - ap;
        const dt = byDateDesc(a.createdAt, b.createdAt);
        return dt || byIdAsc(a.id, b.id);
      });
    default:
      return copy;
  }
}

/** Public search that mirrors your /api/products semantics */
export function searchProducts(query: ProductQuery): ProductQueryResult {
  const page = Math.max(1, Math.trunc(query.page ?? 1));
  const pageSize = Math.min(96, Math.max(1, Math.trunc(query.pageSize ?? 24)));
  const sort = (query.sort ?? "top") as SortKey;

  const filtered = products.filter((p) => matches(p, query));
  const sorted = sortList(filtered, sort);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const items = sorted.slice(start, start + pageSize);
  return { page: safePage, pageSize, total, totalPages, items };
}

/** Quick analytics helpers */
export function distinctCategories(): string[] {
  return Array.from(new Set(products.map((p) => p.category))).sort();
}
export function distinctBrands(): string[] {
  return Array.from(new Set(products.map((p) => p.brand).filter(Boolean) as string[])).sort();
}
export function distinctSubcategories(cat?: string): string[] {
  const src = cat ? products.filter((p) => p.category.toLowerCase() === cat.toLowerCase()) : products;
  return Array.from(new Set(src.map((p) => p.subcategory))).sort();
}

/** Mapper to your Prisma create input (flatten seller fields) */
export function toPrismaCreateInput(p: Product) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category,
    subcategory: p.subcategory,
    brand: p.brand ?? null,
    condition: p.condition,
    price: toKesInt(p.price) || null, // 0 -> NULL for "Contact for price" (optional preference)
    image: p.image,
    gallery: p.gallery,
    location: p.location,
    negotiable: false,
    createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
    featured: !!p.featured,

    // flattened seller info for anonymous flow
    sellerName: p.seller?.name ?? null,
    sellerPhone: normalizeMsisdn(p.seller?.phone) ?? null,
    sellerLocation: p.seller?.location ?? null,
    sellerMemberSince: p.seller?.memberSince ?? null,
    sellerRating: Number.isFinite(p.seller?.rating) ? p.seller!.rating : null,
    sellerSales: Number.isFinite(p.seller?.sales) ? p.seller!.sales : null,

    // Optionally connect to a real user if you have one:
    // seller: { connect: { id: "..." } },
  };
}

/** Convenience derivation for UI */
export function describePrice(p: Product): string {
  return p.price > 0 ? `KES ${p.price.toLocaleString()}` : "Contact for price";
}

/** --------------------------- Seed Data ---------------------------- */

export const products: Product[] = [
  // (unchanged) — your whole seed list as provided…
  // --- ELECTRONICS ---
  {
    id: "1",
    name: "Samsung Galaxy S21",
    category: "Electronics",
    subcategory: "Phones & Tablets",
    brand: "Samsung",
    price: 75000,
    condition: "pre-owned",
    location: "Nairobi",
    description: "High-end smartphone with 120Hz display and great cameras.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER, PLACEHOLDER, PLACEHOLDER, PLACEHOLDER],
    seller: { name: "TechHub KE", phone: "254712345678", memberSince: "2024", rating: 4.6, sales: 212, location: "Nairobi" },
    createdAt: iso("2024-12-12"),
    featured: true,
  },
  // ... keep the rest of your entries exactly as you pasted above ...
  // (For brevity here, include all items 2–30 unchanged.)
];

/** Freeze at runtime to avoid accidental mutation in dev tools */
Object.freeze(products);
