// src/app/lib/listings.ts
import { prisma } from "@/app/lib/prisma";

/* =========================
   Shared types
   ========================= */
export type Mode = "products" | "services";

export type FacetEntry = { value: string; count: number };

export type ProductItem = {
  id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  brand?: string | null;
  condition?: string | null;
  price?: number | null;
  image?: string | null;
  featured?: boolean | null;
  location?: string | null;
  createdAt: string; // ISO
};

export type ServiceItem = {
  id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  price?: number | null;
  image?: string | null;
  featured?: boolean | null;
  location?: string | null;
  rateType?: "hour" | "day" | "fixed" | null;
  availability?: string | null;
  serviceArea?: string | null;
  createdAt: string; // ISO
};

export type ProductFacets = {
  categories?: FacetEntry[];
  brands?: FacetEntry[];
  conditions?: FacetEntry[];
};

export type ServiceFacets = {
  categories?: FacetEntry[];
  subcategories?: FacetEntry[];
};

export type PageResponse<TItems> = {
  mode: "page";
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: TItems[];
  facets?: ProductFacets | ServiceFacets;
};

/* =========================
   Query input
   ========================= */
export type ListingQuery = {
  // common
  q?: string;
  category?: string;
  subcategory?: string;
  featuredOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sort?: "newest" | "featured" | "price_asc" | "price_desc";
  page?: number;
  pageSize?: number;
  includeFacets?: boolean;

  // products only
  brand?: string;
  condition?: "brand new" | "pre-owned";
};

/* =========================
   Tiny utils
   ========================= */
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function normStr(x: unknown): string | undefined {
  if (typeof x !== "string") return undefined;
  const t = x.replace(/[\u0000-\u0008\u000B-\u001F\u007F]+/g, "").trim();
  return t || undefined;
}

function nInt(x: unknown): number | undefined {
  if (typeof x === "number" && Number.isFinite(x)) return Math.round(x);
  if (typeof x === "string" && x.trim() !== "") {
    const n = Number(x);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return undefined;
}

/** Build AND of OR-blocks for tokenized search across provided fields */
function tokenSearchAND(tokens: string[], fields: string[]) {
  if (!tokens.length) return undefined as undefined | Array<Record<string, unknown>>;
  return tokens.map((tok) => ({
    OR: fields.map((f) => ({
      [f]: { contains: tok, mode: "insensitive" as const },
    })),
  }));
}

/* =========================
   Explicit Prisma result types
   ========================= */
// product rows (from findMany select)
type ProductRow = {
  id: string;
  name: string | null;
  category: string | null;
  subcategory: string | null;
  brand: string | null;
  condition: "brand new" | "pre-owned" | null;
  price: number | null;
  image: string | null;
  featured: boolean | null;
  location: string | null;
  createdAt: Date | string | null;
};
// service rows (from findMany select)
type ServiceRow = {
  id: string;
  name: string | null;
  category: string | null;
  subcategory: string | null;
  price: number | null;
  image: string | null;
  featured: boolean | null;
  location: string | null;
  rateType: "hour" | "day" | "fixed" | null;
  availability: string | null;
  serviceArea: string | null;
  createdAt: Date | string | null;
};

// groupBy buckets
type ProductCategoryGroup = { category: string | null; _count: { category: number } };
type ProductBrandGroup = { brand: string | null; _count: { brand: number } };
type ProductConditionGroup = { condition: string | null; _count: { condition: number } };

type ServiceCategoryGroup = { category: string | null; _count: { category: number } };
type ServiceSubcategoryGroup = { subcategory: string | null; _count: { subcategory: number } };

/* =========================
   Products
   ========================= */

export async function getProductsPage(input: ListingQuery): Promise<PageResponse<ProductItem>> {
  const pageSize = clamp(nInt(input.pageSize) ?? 24, 1, 100);
  const page = clamp(nInt(input.page) ?? 1, 1, 10_000);

  const q = normStr(input.q);
  const tokens = q ? q.toLowerCase().split(/\s+/).slice(0, 6) : [];
  const category = normStr(input.category);
  const subcategory = normStr(input.subcategory);
  const brand = normStr(input.brand);
  const condition = (normStr(input.condition) as ListingQuery["condition"]) || undefined;

  const minPrice = nInt(input.minPrice);
  const maxPrice = nInt(input.maxPrice);
  const featuredOnly = !!input.featuredOnly;

  const sort = (input.sort || "newest") as NonNullable<ListingQuery["sort"]>;

  const priceWhere =
    minPrice != null || maxPrice != null
      ? {
          price: {
            ...(minPrice != null ? { gte: minPrice } : {}),
            ...(maxPrice != null ? { lte: maxPrice } : {}),
          },
        }
      : {};

  const where: Record<string, unknown> = {
    status: "ACTIVE",
    ...(featuredOnly ? { featured: true } : {}),
    ...(category ? { category: { equals: category, mode: "insensitive" } } : {}),
    ...(subcategory ? { subcategory: { equals: subcategory, mode: "insensitive" } } : {}),
    ...(brand ? { brand: { equals: brand, mode: "insensitive" } } : {}),
    ...(condition ? { condition } : {}),
    ...priceWhere,
  };

  const searchAND = tokenSearchAND(tokens, [
    "name",
    "category",
    "subcategory",
    "brand",
    "description",
    "location",
  ]);
  const whereFinal = searchAND ? { AND: [where, ...searchAND] } : where;

  const orderBy =
    sort === "featured"
      ? [{ featured: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }]
      : sort === "price_asc"
      ? [{ price: "asc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }]
      : sort === "price_desc"
      ? [{ price: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }]
      : [{ createdAt: "desc" as const }, { id: "desc" as const }];

  const [total, rowsRaw] = await Promise.all([
    prisma.product.count({ where: whereFinal }),
    prisma.product.findMany({
      where: whereFinal,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        category: true,
        subcategory: true,
        brand: true,
        condition: true,
        price: true,
        image: true,
        featured: true,
        location: true,
        createdAt: true,
      },
    }),
  ]);

  const rows = rowsRaw as ProductRow[];

  const items: ProductItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name ?? "Untitled",
    category: r.category ?? null,
    subcategory: r.subcategory ?? null,
    brand: r.brand ?? null,
    condition: r.condition ?? null,
    price: r.price ?? null,
    image: r.image ?? null,
    featured: Boolean(r.featured),
    location: r.location ?? null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
  }));

  let facets: ProductFacets | undefined;
  if (input.includeFacets) {
    const [catsRaw, brandsRaw, condsRaw] = await Promise.all([
      prisma.product
        .groupBy({
          by: ["category"],
          where: whereFinal,
          _count: { category: true },
        })
        .catch(() => [] as ProductCategoryGroup[]),
      prisma.product
        .groupBy({
          by: ["brand"],
          where: whereFinal,
          _count: { brand: true },
        })
        .catch(() => [] as ProductBrandGroup[]),
      prisma.product
        .groupBy({
          by: ["condition"],
          where: whereFinal,
          _count: { condition: true },
        })
        .catch(() => [] as ProductConditionGroup[]),
    ]);

    const cats = catsRaw as ProductCategoryGroup[];
    const brands = brandsRaw as ProductBrandGroup[];
    const conds = condsRaw as ProductConditionGroup[];

    facets = {
      categories: cats
        .filter((x) => !!x.category)
        .map<FacetEntry>((x) => ({ value: x.category as string, count: x._count.category }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      brands: brands
        .filter((x) => !!x.brand)
        .map<FacetEntry>((x) => ({ value: x.brand as string, count: x._count.brand }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      conditions: conds
        .filter((x) => !!x.condition)
        .map<FacetEntry>((x) => ({ value: x.condition as string, count: x._count.condition }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    };
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    mode: "page",
    page,
    pageSize,
    total,
    totalPages,
    items,
    ...(facets ? { facets } : {}),
  };
}

/* =========================
   Services
   ========================= */

export async function getServicesPage(input: ListingQuery): Promise<PageResponse<ServiceItem>> {
  const pageSize = clamp(nInt(input.pageSize) ?? 24, 1, 100);
  const page = clamp(nInt(input.page) ?? 1, 1, 10_000);

  const q = normStr(input.q);
  const tokens = q ? q.toLowerCase().split(/\s+/).slice(0, 6) : [];
  const category = normStr(input.category);
  const subcategory = normStr(input.subcategory);

  const minPrice = nInt(input.minPrice);
  const maxPrice = nInt(input.maxPrice);
  const featuredOnly = !!input.featuredOnly;

  const sort = (input.sort || "newest") as NonNullable<ListingQuery["sort"]>;

  const priceWhere =
    minPrice != null || maxPrice != null
      ? {
          price: {
            ...(minPrice != null ? { gte: minPrice } : {}),
            ...(maxPrice != null ? { lte: maxPrice } : {}),
          },
        }
      : {};

  const where: Record<string, unknown> = {
    status: "ACTIVE",
    ...(featuredOnly ? { featured: true } : {}),
    ...(category ? { category: { equals: category, mode: "insensitive" } } : {}),
    ...(subcategory ? { subcategory: { equals: subcategory, mode: "insensitive" } } : {}),
    ...priceWhere,
  };

  const searchAND = tokenSearchAND(tokens, [
    "name",
    "category",
    "subcategory",
    "description",
    "availability",
    "serviceArea",
    "location",
  ]);
  const whereFinal = searchAND ? { AND: [where, ...searchAND] } : where;

  const orderBy =
    sort === "featured"
      ? [{ featured: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }]
      : sort === "price_asc"
      ? [{ price: "asc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }]
      : sort === "price_desc"
      ? [{ price: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }]
      : [{ createdAt: "desc" as const }, { id: "desc" as const }];

  const [total, rowsRaw] = await Promise.all([
    prisma.service.count({ where: whereFinal }),
    prisma.service.findMany({
      where: whereFinal,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        category: true,
        subcategory: true,
        price: true,
        image: true,
        featured: true,
        location: true,
        rateType: true,
        availability: true,
        serviceArea: true,
        createdAt: true,
      },
    }),
  ]);

  const rows = rowsRaw as ServiceRow[];

  const items: ServiceItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name ?? "Untitled",
    category: r.category ?? null,
    subcategory: r.subcategory ?? null,
    price: r.price ?? null,
    image: r.image ?? null,
    featured: Boolean(r.featured),
    location: r.location ?? null,
    rateType: (r.rateType as ServiceItem["rateType"]) ?? null,
    availability: r.availability ?? null,
    serviceArea: r.serviceArea ?? null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
  }));

  let facets: ServiceFacets | undefined;
  if (input.includeFacets) {
    const [catsRaw, subsRaw] = await Promise.all([
      prisma.service
        .groupBy({
          by: ["category"],
          where: whereFinal,
          _count: { category: true },
        })
        .catch(() => [] as ServiceCategoryGroup[]),
      prisma.service
        .groupBy({
          by: ["subcategory"],
          where: whereFinal,
          _count: { subcategory: true },
        })
        .catch(() => [] as ServiceSubcategoryGroup[]),
    ]);

    const cats = catsRaw as ServiceCategoryGroup[];
    const subs = subsRaw as ServiceSubcategoryGroup[];

    facets = {
      categories: cats
        .filter((x) => !!x.category)
        .map<FacetEntry>((x) => ({ value: x.category as string, count: x._count.category }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      subcategories: subs
        .filter((x) => !!x.subcategory)
        .map<FacetEntry>((x) => ({ value: x.subcategory as string, count: x._count.subcategory }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
    };
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    mode: "page",
    page,
    pageSize,
    total,
    totalPages,
    items,
    ...(facets ? { facets } : {}),
  };
}
