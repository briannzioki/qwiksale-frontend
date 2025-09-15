/** ----------------------------- Types ------------------------------ */

export type Condition = "brand new" | "pre-owned";

export interface Seller {
  name: string;
  phone?: string; // WhatsApp deep-link (normalized to 2547XXXXXXXX if possible)
  memberSince: string;
  rating: number;
  sales: number;
  location: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  brand?: string | null;
  price: number;
  condition: Condition;
  location: string;
  description: string;
  image: string;
  gallery: string[];
  seller: Seller;

  createdAt?: string;
  featured?: boolean;
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

export function normalizeMsisdn(input?: string): string | undefined {
  if (!input) return undefined;
  let s = input.replace(/\D+/g, "");
  if (s.startsWith("2547") && s.length === 12) return s;
  if (s.startsWith("07") && s.length === 10) return "254" + s.slice(1);
  if (s.startsWith("254") && s.length === 12) return s;
  if (!/^2547\d{8}$/.test(s)) return undefined;
  return s;
}

export function makeWhatsAppLink(phone?: string, text?: string): string | undefined {
  const msisdn = normalizeMsisdn(phone);
  if (!msisdn) return undefined;
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${msisdn}${q}`;
}

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

const ciIncludes = (a: string, b: string) =>
  a.toLowerCase().includes((b || "").toLowerCase());

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
    if (!(p.price === 0 || (p.price >= min && p.price <= max))) return false;
  } else if (typeof min === "number") {
    if (!(p.price === 0 || p.price >= min)) return false;
  } else if (typeof max === "number") {
    if (!(p.price === 0 || p.price <= max)) return false;
  }
  return true;
}

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

/** -------------------- Distinct utilities -------------------- */
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

/** -------------------- Suggestion engine -------------------- */
export type Suggestion = { label: string; type: "product" | "brand" | "category" | "subcategory" | "seller" };

export function suggestProducts(query: string, limit = 12): Suggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const pool: Suggestion[] = [];

  // product names
  for (const p of products) {
    if (p.name.toLowerCase().includes(q)) pool.push({ label: p.name, type: "product" });
  }
  // brands
  for (const b of distinctBrands()) {
    if (b.toLowerCase().includes(q)) pool.push({ label: b, type: "brand" });
  }
  // categories
  for (const c of distinctCategories()) {
    if (c.toLowerCase().includes(q)) pool.push({ label: c, type: "category" });
  }
  // subcategories
  for (const s of distinctSubcategories()) {
    if (s.toLowerCase().includes(q)) pool.push({ label: s, type: "subcategory" });
  }
  // sellers
  for (const p of products) {
    if (p.seller?.name?.toLowerCase().includes(q)) {
      pool.push({ label: p.seller.name, type: "seller" });
    }
  }

  // remove duplicates
  const uniq = new Map<string, Suggestion>();
  for (const s of pool) {
    if (!uniq.has(`${s.type}:${s.label.toLowerCase()}`)) {
      uniq.set(`${s.type}:${s.label.toLowerCase()}`, s);
    }
  }

  return [...uniq.values()].slice(0, limit);
}

/** --------------------------- Seed Data ---------------------------- */
export const products: Product[] = [
  // Clean real DB-backed products will replace this seed later.
];
Object.freeze(products);
