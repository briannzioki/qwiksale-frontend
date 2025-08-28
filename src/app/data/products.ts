// src/app/data/products.ts

/** ----------------------------- Types ------------------------------ */

export type Condition = "brand new" | "pre-owned";

export interface Seller {
  name: string;
  phone?: string;        // optional for WhatsApp deep-link (2547XXXXXXXX)
  memberSince: string;   // e.g. "2024"
  rating: number;        // 0–5
  sales: number;         // total completed sales
  location: string;      // seller base location
}

export interface Product {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  brand?: string;
  price: number;         // KES (0 = contact for price)
  condition: Condition;
  location: string;      // item location
  description: string;
  image: string;         // primary image (used for cards)
  gallery: string[];     // gallery (first image = primary)
  seller: Seller;

  // Optional fields to align with app & API models
  createdAt?: string;    // ISO; if absent, consumer may fill with new Date().toISOString()
  featured?: boolean;    // "verified" highlight in UI
}

/** --------------------------- Constants ---------------------------- */

export const PLACEHOLDER = "/placeholder/default.jpg";

/** ------------------------- Normalizers ---------------------------- */

export function normalizeCondition(s: string): Condition {
  const t = s.trim().toLowerCase();
  if (t === "brand new" || t === "brand-new" || t === "brand_new") return "brand new";
  return "pre-owned";
}

export function toKesInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

/** 2547XXXXXXXX, accepts 07XXXXXXXX or +2547XXXXXXXX and normalizes */
export function normalizeMsisdn(input?: string): string | undefined {
  if (!input) return undefined;
  let s = input.replace(/\D+/g, "");
  if (/^07\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^\+2547\d{8}$/.test("+" + s)) s = s.replace(/^\+/, "");
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

/** Utility for simple date stamping */
export function iso(d: string): string {
  // if parsing fails, fallback to now
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

/** Case-insensitive contains */
const ciIncludes = (a: string, b: string) => a.toLowerCase().includes(b.toLowerCase());

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
    // keep contact-for-price (0) visible regardless, else price in [min,max]
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
  const byDate = (a?: string, b?: string) =>
    (b ? +new Date(b) : 0) - (a ? +new Date(a) : 0);

  const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

  const copy = [...list];

  switch (sort) {
    case "top":
      return copy.sort((a, b) => {
        if (!!b.featured !== !!a.featured) return Number(b.featured) - Number(a.featured);
        const dt = byDate(a.createdAt, b.createdAt);
        if (dt) return dt;
        return byId(a.id, b.id);
      });
    case "new":
      return copy.sort((a, b) => {
        const dt = byDate(a.createdAt, b.createdAt);
        if (dt) return dt;
        return byId(a.id, b.id);
      });
    case "price_asc":
      return copy.sort((a, b) => {
        // Put "contact for price" (0) at the end
        const ap = a.price === 0 ? Number.POSITIVE_INFINITY : a.price;
        const bp = b.price === 0 ? Number.POSITIVE_INFINITY : b.price;
        if (ap !== bp) return ap - bp;
        const dt = byDate(a.createdAt, b.createdAt);
        if (dt) return dt;
        return byId(a.id, b.id);
      });
    case "price_desc":
      return copy.sort((a, b) => {
        // Put "contact for price" (0) at the end
        const ap = a.price === 0 ? Number.NEGATIVE_INFINITY : a.price;
        const bp = b.price === 0 ? Number.NEGATIVE_INFINITY : b.price;
        if (ap !== bp) return bp - ap;
        const dt = byDate(a.createdAt, b.createdAt);
        if (dt) return dt;
        return byId(a.id, b.id);
      });
    default:
      return copy;
  }
}

/** Public search that mirrors your /api/products semantics */
export function searchProducts(query: ProductQuery): ProductQueryResult {
  const {
    page = 1,
    pageSize = 24,
    sort = "top",
  } = query;

  const filtered = products.filter((p) => matches(p, query));
  const sorted = sortList(filtered, sort);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
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
  const src = cat
    ? products.filter((p) => p.category.toLowerCase() === cat.toLowerCase())
    : products;
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
  // ---------- ELECTRONICS ----------
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
  {
    id: "2",
    name: "iPhone 13 Pro",
    category: "Electronics",
    subcategory: "Phones & Tablets",
    brand: "Apple",
    price: 120000,
    condition: "brand new",
    location: "Nairobi",
    description: "iPhone 13 Pro with ProMotion and A15 Bionic.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER, PLACEHOLDER, PLACEHOLDER],
    seller: { name: "ApplePoint KE", phone: "254700111222", memberSince: "2023", rating: 4.8, sales: 480, location: "Nairobi" },
    createdAt: iso("2025-01-05"),
    featured: true,
  },
  {
    id: "3",
    name: "Tecno Spark 10",
    category: "Electronics",
    subcategory: "Phones & Tablets",
    brand: "Tecno",
    price: 20000,
    condition: "brand new",
    location: "Thika",
    description: "Affordable phone with solid battery life.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER, PLACEHOLDER],
    seller: { name: "GadgetMall", phone: "254733889900", memberSince: "2022", rating: 4.3, sales: 156, location: "Thika" },
    createdAt: iso("2025-02-10"),
  },
  {
    id: "4",
    name: "Dell XPS 13",
    category: "Electronics",
    subcategory: "Computers & Laptops",
    brand: "Dell",
    price: 95000,
    condition: "pre-owned",
    location: "Westlands",
    description: "Compact ultrabook, 16GB RAM, 512GB SSD.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER, PLACEHOLDER, PLACEHOLDER],
    seller: { name: "Laptop Lab", phone: "254710456789", memberSince: "2021", rating: 4.5, sales: 389, location: "Nairobi" },
    createdAt: iso("2025-03-01"),
    featured: true,
  },
  {
    id: "5",
    name: "HP Pavilion 15",
    category: "Electronics",
    subcategory: "Computers & Laptops",
    brand: "HP",
    price: 70000,
    condition: "brand new",
    location: "Nakuru",
    description: "Core i5, 8GB RAM, 512GB SSD — great for work/school.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER],
    seller: { name: "NakTech", phone: "254720111333", memberSince: "2024", rating: 4.2, sales: 86, location: "Nakuru" },
    createdAt: iso("2025-03-15"),
  },
  {
    id: "6",
    name: "LG Smart TV 55-inch",
    category: "Electronics",
    subcategory: "Home Appliances",
    brand: "LG",
    price: 80000,
    condition: "brand new",
    location: "Kisumu",
    description: "4K UHD webOS TV with thin bezels.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER, PLACEHOLDER],
    seller: { name: "Lakeside Electronics", phone: "254739555111", memberSince: "2020", rating: 4.4, sales: 270, location: "Kisumu" },
    createdAt: iso("2025-04-02"),
  },
  {
    id: "7",
    name: "Samsung Double Door Fridge",
    category: "Electronics",
    subcategory: "Home Appliances",
    brand: "Samsung",
    price: 60000,
    condition: "pre-owned",
    location: "Eldoret",
    description: "Energy-efficient fridge with inverter compressor.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER],
    seller: { name: "HomeDeals KE", phone: "254711777444", memberSince: "2022", rating: 4.1, sales: 142, location: "Eldoret" },
    createdAt: iso("2025-04-20"),
  },

  // ---------- VEHICLES ----------
  {
    id: "8",
    name: "Toyota Corolla 2015",
    category: "Vehicles",
    subcategory: "Cars",
    brand: "Toyota",
    price: 1200000,
    condition: "pre-owned",
    location: "Nairobi",
    description: "Well-maintained unit, clean interior, accident-free.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER, PLACEHOLDER],
    seller: { name: "AutoHub", phone: "254722111444", memberSince: "2019", rating: 4.6, sales: 520, location: "Nairobi" },
    createdAt: iso("2025-02-18"),
    featured: true,
  },
  {
    id: "9",
    name: "Nissan X-Trail",
    category: "Vehicles",
    subcategory: "Cars",
    brand: "Nissan",
    price: 1800000,
    condition: "pre-owned",
    location: "Mombasa",
    description: "Fresh import, 4WD, great family SUV.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER],
    seller: { name: "Coast Motors", phone: "254734666222", memberSince: "2021", rating: 4.3, sales: 198, location: "Mombasa" },
    createdAt: iso("2025-05-09"),
  },
  {
    id: "10",
    name: "Honda CRF 250",
    category: "Vehicles",
    subcategory: "Motorcycles",
    brand: "Honda",
    price: 350000,
    condition: "pre-owned",
    location: "Nakuru",
    description: "Off-road bike, serviced, ready to ride.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER, PLACEHOLDER, PLACEHOLDER],
    seller: { name: "Ride KE", phone: "254701555000", memberSince: "2020", rating: 4.5, sales: 124, location: "Nakuru" },
    createdAt: iso("2025-05-12"),
  },
  {
    id: "26",
    name: "Car Vacuum Cleaner",
    category: "Vehicles",
    subcategory: "Vehicle Parts & Accessories",
    brand: "Generic",
    price: 3500,
    condition: "brand new",
    location: "Nairobi",
    description: "Portable 12V cleaner, includes nozzles.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER],
    seller: { name: "Auto Access KE", phone: "254714888666", memberSince: "2023", rating: 4.0, sales: 77, location: "Nairobi" },
    createdAt: iso("2025-06-01"),
  },
  {
    id: "27",
    name: "Motorcycle Helmet",
    category: "Vehicles",
    subcategory: "Motorcycles",
    brand: "Generic",
    price: 4500,
    condition: "brand new",
    location: "Kisii",
    description: "Lightweight ABS shell with clear visor.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER, PLACEHOLDER],
    seller: { name: "MotoGear", phone: "254718223344", memberSince: "2022", rating: 4.2, sales: 93, location: "Kisii" },
    createdAt: iso("2025-06-10"),
  },

  // ---------- PROPERTY ----------
  {
    id: "11",
    name: "2-Bedroom Apartment in Nairobi",
    category: "Property",
    subcategory: "Houses & Apartments for Rent",
    brand: "Private",
    price: 45000,
    condition: "pre-owned",
    location: "Nairobi",
    description: "Modern apartment with parking and borehole. Monthly rent.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER, PLACEHOLDER],
    seller: { name: "Mary W.", phone: "254725000111", memberSince: "2024", rating: 4.1, sales: 12, location: "Nairobi" },
    createdAt: iso("2025-03-21"),
  },
  {
    id: "12",
    name: "3-Bedroom House in Ruiru",
    category: "Property",
    subcategory: "Houses & Apartments for Sale",
    brand: "Private",
    price: 7500000,
    condition: "pre-owned",
    location: "Ruiru",
    description: "Gated estate, spacious compound, clean title.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER],
    seller: { name: "Prime Homes", phone: "254733111555", memberSince: "2021", rating: 4.4, sales: 65, location: "Kiambu" },
    createdAt: iso("2025-04-28"),
  },

  // ---------- FASHION ----------
  {
    id: "13",
    name: "Nike Air Force 1",
    category: "Fashion",
    subcategory: "Shoes",
    brand: "Nike",
    price: 8000,
    condition: "brand new",
    location: "Nairobi",
    description: "Classic AF1 sneakers — white.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER, PLACEHOLDER],
    seller: { name: "SneakerSpot", phone: "254712909090", memberSince: "2020", rating: 4.7, sales: 340, location: "Nairobi" },
    createdAt: iso("2025-01-19"),
  },
  {
    id: "14",
    name: "Adidas Hoodie",
    category: "Fashion",
    subcategory: "Clothing",
    brand: "Adidas",
    price: 5000,
    condition: "brand new",
    location: "Eldoret",
    description: "Comfy hoodie for casual wear.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER],
    seller: { name: "CozyWear", phone: "254710010010", memberSince: "2023", rating: 4.3, sales: 91, location: "Eldoret" },
    createdAt: iso("2025-05-06"),
  },
  {
    id: "15",
    name: "Rolex Submariner",
    category: "Fashion",
    subcategory: "Watches & Jewelry",
    brand: "Rolex",
    price: 1500000,
    condition: "pre-owned",
    location: "Nairobi",
    description: "Iconic luxury timepiece — serious buyers only.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER, PLACEHOLDER],
    seller: { name: "Timepiece KE", phone: "254713333777", memberSince: "2019", rating: 4.9, sales: 58, location: "Nairobi" },
    createdAt: iso("2025-02-14"),
    featured: true,
  },

  // ---------- HOME & GARDEN ----------
  {
    id: "16",
    name: "Wooden Coffee Table",
    category: "Home & Garden",
    subcategory: "Furniture",
    brand: "Local",
    price: 15000,
    condition: "brand new",
    location: "Kikuyu",
    description: "Handmade modern coffee table.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER, PLACEHOLDER, PLACEHOLDER],
    seller: { name: "Oak & Pine", phone: "254719555321", memberSince: "2022", rating: 4.5, sales: 140, location: "Kiambu" },
    createdAt: iso("2025-06-02"),
  },
  {
    id: "17",
    name: "Artificial Plant Set",
    category: "Home & Garden",
    subcategory: "Home Decor",
    brand: "Generic",
    price: 2500,
    condition: "brand new",
    location: "Nairobi",
    description: "Set of 3 indoor artificial plants.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER],
    seller: { name: "Decora", phone: "254711800600", memberSince: "2024", rating: 4.0, sales: 45, location: "Nairobi" },
    createdAt: iso("2025-03-30"),
  },

  // ---------- SPORTS & OUTDOORS ----------
  {
    id: "18",
    name: "Gym Dumbbells Set",
    category: "Sports & Outdoors",
    subcategory: "Fitness Equipment",
    brand: "Generic",
    price: 8000,
    condition: "pre-owned",
    location: "Kasarani",
    description: "Adjustable dumbbells — lightly used.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER, PLACEHOLDER],
    seller: { name: "FitYard", phone: "254724444444", memberSince: "2021", rating: 4.2, sales: 110, location: "Nairobi" },
    createdAt: iso("2025-04-08"),
  },
  {
    id: "19",
    name: "Camping Tent 4-Person",
    category: "Sports & Outdoors",
    subcategory: "Camping & Hiking",
    brand: "Coleman",
    price: 20000,
    condition: "brand new",
    location: "Naivasha",
    description: "Weather-resistant family tent.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER, PLACEHOLDER],
    seller: { name: "OutdoorPro", phone: "254720777222", memberSince: "2020", rating: 4.6, sales: 175, location: "Naivasha" },
    createdAt: iso("2025-04-18"),
  },
  {
    id: "28",
    name: "Acoustic Guitar Yamaha",
    category: "Sports & Outdoors",
    subcategory: "Musical Instruments",
    brand: "Yamaha",
    price: 18000,
    condition: "pre-owned",
    location: "Nairobi",
    description: "Beginner-friendly acoustic guitar, great tone.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER],
    seller: { name: "MusicNest", phone: "254723900500", memberSince: "2018", rating: 4.7, sales: 260, location: "Nairobi" },
    createdAt: iso("2025-05-24"),
  },
  {
    id: "29",
    name: "DJ Mixer Pioneer",
    category: "Sports & Outdoors",
    subcategory: "Musical Instruments",
    brand: "Pioneer",
    price: 45000,
    condition: "brand new",
    location: "Nairobi",
    description: "2-channel DJ mixer — performance ready.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER, PLACEHOLDER],
    seller: { name: "BeatLab KE", phone: "254726550011", memberSince: "2022", rating: 4.5, sales: 132, location: "Nairobi" },
    createdAt: iso("2025-06-20"),
    featured: true,
  },

  // ---------- KIDS & BABIES ----------
  {
    id: "20",
    name: "Baby Stroller",
    category: "Kids & Babies",
    subcategory: "Baby Gear",
    brand: "Chicco",
    price: 15000,
    condition: "brand new",
    location: "Kiambu",
    description: "Lightweight stroller with recline and canopy.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER],
    seller: { name: "BabyJoy", phone: "254700220044", memberSince: "2023", rating: 4.4, sales: 88, location: "Kiambu" },
    createdAt: iso("2025-03-02"),
  },
  {
    id: "21",
    name: "LEGO Classic Set",
    category: "Kids & Babies",
    subcategory: "Toys",
    brand: "LEGO",
    price: 5000,
    condition: "brand new",
    location: "Nairobi",
    description: "Creative building blocks, ages 6+.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER, PLACEHOLDER],
    seller: { name: "ToyTown", phone: "254736777555", memberSince: "2019", rating: 4.6, sales: 320, location: "Nairobi" },
    createdAt: iso("2025-02-08"),
  },

  // ---------- HEALTH & BEAUTY ----------
  {
    id: "22",
    name: "Nivea Body Lotion",
    category: "Health & Beauty",
    subcategory: "Skincare",
    brand: "Nivea",
    price: 1200,
    condition: "brand new",
    location: "Nairobi",
    description: "Hydrating body lotion for smooth skin.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER],
    seller: { name: "SelfCare KE", phone: "254719100200", memberSince: "2024", rating: 4.2, sales: 60, location: "Nairobi" },
    createdAt: iso("2025-06-05"),
  },
  {
    id: "23",
    name: "Maybelline Lipstick",
    category: "Health & Beauty",
    subcategory: "Makeup",
    brand: "Maybelline",
    price: 900,
    condition: "brand new",
    location: "Nairobi",
    description: "Long-lasting matte lipstick.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER, PLACEHOLDER],
    seller: { name: "BeautyBar", phone: "254718880066", memberSince: "2022", rating: 4.3, sales: 140, location: "Nairobi" },
    createdAt: iso("2025-05-14"),
  },

  // ---------- SERVICES (0 price => “contact for price”) ----------
  {
    id: "24",
    name: "Plumbing Services",
    category: "Services",
    subcategory: "Home Services",
    brand: "Private",
    price: 0,
    condition: "pre-owned",
    location: "Nairobi",
    description: "Professional plumbing for homes/offices. Call or WhatsApp.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER],
    seller: { name: "FixIt Plumbers", phone: "254701234567", memberSince: "2017", rating: 4.6, sales: 590, location: "Nairobi" },
    createdAt: iso("2025-01-30"),
  },
  {
    id: "25",
    name: "Private Tuition",
    category: "Services",
    subcategory: "Education",
    brand: "Private",
    price: 0,
    condition: "pre-owned",
    location: "Nairobi",
    description: "One-on-one tutoring for primary and secondary.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER],
    seller: { name: "Tutor KE", phone: "254709876543", memberSince: "2020", rating: 4.5, sales: 220, location: "Nairobi" },
    createdAt: iso("2025-02-22"),
  },

  // ---------- OTHERS ----------
  {
    id: "30",
    name: "Second-hand Books Bundle",
    category: "Others",
    subcategory: "Books",
    brand: "Generic",
    price: 1500,
    condition: "pre-owned",
    location: "Kahawa West",
    description: "Assorted novels and textbooks in good condition.",
    image: PLACEHOLDER,
    gallery: [PLACEHOLDER, PLACEHOLDER],
    seller: { name: "BookNest", phone: "254711119999", memberSince: "2021", rating: 4.4, sales: 102, location: "Nairobi" },
    createdAt: iso("2025-03-11"),
  },
];

/** Freeze at runtime to avoid accidental mutation in dev tools */
Object.freeze(products);
