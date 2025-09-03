/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import fs from "node:fs";

const prisma = new PrismaClient();

/* =============================
   Config via environment vars
   =============================

   SEED_RESET=1            -> delete test products/favorites/payments first
   SEED_MIN=40             -> minimum number of products after cloning
   SEED_SOURCE=/abs/file   -> optional override path to a products module/json
   SEED_DEMO_USER_EMAIL    -> email for demo seller (default seller@qwiksale.test)
   SEED_DEMO_USER_NAME     -> name for demo seller (default Demo Seller)
   SEED_ALLOW_PROD=1       -> allow RESET in production (use with caution!)
*/

const SEED_RESET = process.env.SEED_RESET === "1";
const SEED_MIN = Number.isFinite(Number(process.env.SEED_MIN))
  ? Math.max(1, Number(process.env.SEED_MIN))
  : 40;

const SEED_SOURCE = process.env.SEED_SOURCE || ""; // optional explicit file
const DEMO_EMAIL = process.env.SEED_DEMO_USER_EMAIL || "seller@qwiksale.test";
const DEMO_NAME = process.env.SEED_DEMO_USER_NAME || "Demo Seller";

/* ==============
   Types (local)
   ============== */
type RawSeller = {
  name?: string;
  phone?: string;
  location?: string;
  memberSince?: string;
  rating?: number;
  sales?: number;
};

type RawProduct = {
  id?: string | number;
  name: string;
  description?: string;
  category: string;
  subcategory: string;
  brand?: string;
  condition?: "brand new" | "pre-owned" | string;
  price?: number | string | null;
  image?: string | null;
  gallery?: unknown; // be tolerant; we’ll coerce to string[]
  location?: string;
  negotiable?: boolean;
  createdAt?: string | Date;
  seller?: RawSeller;
  sellerName?: string;
  sellerPhone?: string;
  sellerLocation?: string;
  sellerMemberSince?: string;
  sellerRating?: number;
  sellerSales?: number;
  featured?: boolean;
};

/** Minimal shape for createMany rows (avoid depending on Prisma.* types) */
type CreateRow = {
  name: string;
  description: string | null;
  category: string;
  subcategory: string;
  brand: string | null;
  condition: string;
  price: number | null;
  image: string | null;
  gallery: string[];
  location: string | null;
  negotiable: boolean;
  createdAt: Date;
  featured: boolean;
  sellerName: string | null;
  sellerPhone: string | null;
  sellerLocation: string | null;
  sellerMemberSince: string | null;
  sellerRating: number | null;
  sellerSales: number | null;
  sellerId: string | null;
};

/* ==============
   Load products
   ============== */
function loadSeed(): RawProduct[] {
  const tryFiles: string[] = [];
  if (SEED_SOURCE) {
    tryFiles.push(path.resolve(SEED_SOURCE));
  } else {
    tryFiles.push(
      path.resolve(__dirname, "../src/app/data/products.ts"),
      path.resolve(__dirname, "../src/data/products.ts"),
      path.resolve(__dirname, "../src/app/data/products.js"),
      path.resolve(__dirname, "../src/data/products.js"),
      path.resolve(__dirname, "../src/app/data/products.json"),
      path.resolve(__dirname, "../src/data/products.json"),
    );
  }

  for (const p of tryFiles) {
    if (!fs.existsSync(p)) continue;

    try {
      if (p.endsWith(".json")) {
        const json = JSON.parse(fs.readFileSync(p, "utf8"));
        if (Array.isArray(json)) return json as RawProduct[];
        if (Array.isArray((json as any)?.products)) return (json as any).products as RawProduct[];
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(p);
      const arr =
        (Array.isArray(mod?.products) && mod.products) ||
        (Array.isArray(mod?.default) && mod.default);
      if (Array.isArray(arr)) return arr as RawProduct[];
    } catch (e) {
      console.warn(`Could not load seed file ${p}`, (e as any)?.message || e);
    }
  }

  // Fallback small dataset
  console.warn("No external seed file found; using built-in demo dataset.");
  const builtin: RawProduct[] = [
    { name: "Samsung Galaxy A24", category: "Phones & Tablets", subcategory: "Android Phones", brand: "Samsung", condition: "pre-owned", price: 24500, image: "https://picsum.photos/seed/galaxy-a24/800/600", featured: true,  sellerLocation: "Nairobi" },
    { name: "Apple iPhone 12",    category: "Phones & Tablets", subcategory: "iPhones",        brand: "Apple",   condition: "pre-owned", price: 58000, image: "https://picsum.photos/seed/iphone-12/800/600", sellerLocation: "Nairobi" },
    { name: "Lenovo Tab M10",     category: "Phones & Tablets", subcategory: "Tablets",        brand: "Lenovo",  condition: "brand new", price: 28500, image: "https://picsum.photos/seed/lenovo-m10/800/600", sellerLocation: "Mombasa" },
    { name: "Sony Bravia 55\" 4K TV", category: "Electronics", subcategory: "TVs", brand: "Sony",   condition: "pre-owned", price: 68000, image: "https://picsum.photos/seed/bravia-55/800/600", featured: true, sellerLocation: "Nakuru" },
    { name: "HP EliteBook 840 G6",    category: "Electronics", subcategory: "Laptops", brand: "HP", condition: "pre-owned", price: 52000, image: "https://picsum.photos/seed/elitebook-840/800/600", sellerLocation: "Eldoret" },
    { name: "LG Soundbar SN5",        category: "Electronics", subcategory: "Audio",   brand: "LG", condition: "brand new", price: 28500, image: "https://picsum.photos/seed/lg-sn5/800/600", sellerLocation: "Kisumu" },
  ];
  return builtin;
}

/* =================
   Helper utilities
   ================= */
function toPrice(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

function normalizePhone(input?: string | null): string | null {
  if (!input) return null;
  let s = String(input).replace(/\D+/g, "");
  if (/^07\d{8}$/.test(s)) s = "254" + s.slice(1); // 07XXXXXXXX -> 2547XXXXXXXX
  if (/^\+2547\d{8}$/.test(s)) s = s.replace(/^\+/, "");
  if (!/^2547\d{8}$/.test(s)) return null;
  return s;
}

function randomCreatedAt(daysBack = 45) {
  const now = Date.now();
  const delta = Math.floor(Math.random() * daysBack * 24 * 60 * 60 * 1000);
  return new Date(now - delta);
}

function clonePrice(n: number | null, bumpFactor: number): number | null {
  if (n === null) return null;
  const d = Math.round(n * bumpFactor);
  return Math.max(0, n + d);
}

function pick<T>(arr: T[], i: number) {
  return arr[i % arr.length];
}

function coerceGallery(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter((s) => s.length > 0);
}

/** Ensure we have at least `minCount` rows by lightly cloning with small diffs. */
function makeAtLeast(seed: RawProduct[], minCount: number): RawProduct[] {
  if (seed.length >= minCount) return seed;

  const brands = [
    "Samsung","Apple","Tecno","Infinix","HP","Dell","Lenovo","Sony","LG",
    "Toyota","Nissan","Mazda","Subaru","Generic","Custom",
  ];

  const out: RawProduct[] = [...seed];
  let i = 0;
  while (out.length < minCount) {
    const base = pick(seed, i);
    const bump = ((i % 7) - 3) * 0.04; // -12% … +12%
    out.push({
      ...base,
      id: undefined,
      name: `${base.name} • Batch ${Math.floor(i / Math.max(seed.length, 1)) + 1}`,
      price: clonePrice(toPrice(base.price), bump),
      brand: base.brand || pick(brands, i),
      createdAt: randomCreatedAt(),
      image: typeof base.image === "string" && base.image ? base.image : "https://picsum.photos/seed/qwiksale-default/800/600",
      gallery:
        Array.isArray(base.gallery) && base.gallery.length > 0
          ? (base.gallery as unknown[]).map(String)
          : ["https://picsum.photos/seed/qwiksale-1/800/600"],
      sellerName: base.sellerName || base.seller?.name || "Private Seller",
      sellerPhone: normalizePhone(base.sellerPhone || base.seller?.phone || "254700000000") || undefined,
      sellerLocation: base.sellerLocation || base.seller?.location || "Nairobi",
      sellerMemberSince: base.sellerMemberSince || base.seller?.memberSince || "2024",
      sellerRating:
        typeof base.sellerRating === "number"
          ? base.sellerRating
          : typeof base.seller?.rating === "number"
          ? (base.seller as RawSeller).rating!
          : 4.5,
      sellerSales:
        typeof base.sellerSales === "number"
          ? base.sellerSales
          : typeof base.seller?.sales === "number"
          ? (base.seller as RawSeller).sales!
          : 1,
      featured: Boolean(base.featured && i % 3 !== 0),
    });
    i++;
  }
  return out;
}

/* Map RawProduct -> createMany rows (typed locally as CreateRow[]) */
function mapToCreateMany(src: RawProduct[], attachSellerId?: string | null): CreateRow[] {
  return src.map((p, idx) => {
    const name = String(p.name);
    const category = String(p.category || "Misc");
    const subcategory = String(p.subcategory || "General");

    const condRaw = (p.condition || "").toString().toLowerCase().trim();
    const condition =
      condRaw === "brand new" || condRaw === "brand-new" || condRaw === "brand_new"
        ? "brand new"
        : condRaw === "pre-owned" || condRaw === "pre owned" || condRaw === "pre_owned" || condRaw === "used"
        ? "pre-owned"
        : "pre-owned";

    const normalizedPhone = normalizePhone(p.sellerPhone || p.seller?.phone || null);

    // 80% of rows owned by demo seller if provided
    const useDemoSeller = !!attachSellerId && idx % 5 !== 0;

    const row: CreateRow = {
      name,
      description: p.description ?? null,
      category,
      subcategory,
      brand: p.brand ?? null,
      condition,
      price: toPrice(p.price),
      image: typeof p.image === "string" ? p.image : null,
      gallery: coerceGallery(p.gallery),
      location: p.location ?? p.sellerLocation ?? p.seller?.location ?? null,
      negotiable: Boolean(p.negotiable ?? false),
      createdAt: p.createdAt ? new Date(p.createdAt) : randomCreatedAt(),
      featured: Boolean(p.featured ?? (idx % 9 === 0)),

      // flattened snapshot fields
      sellerName: p.sellerName ?? p.seller?.name ?? (useDemoSeller ? null : "Private Seller"),
      sellerPhone: useDemoSeller ? null : (normalizedPhone || null),
      sellerLocation: p.sellerLocation ?? p.seller?.location ?? (useDemoSeller ? null : "Nairobi"),
      sellerMemberSince: p.sellerMemberSince ?? p.seller?.memberSince ?? (useDemoSeller ? null : "2024"),
      sellerRating:
        typeof p.sellerRating === "number"
          ? p.sellerRating
          : typeof p.seller?.rating === "number"
          ? (p.seller as RawSeller).rating!
          : (useDemoSeller ? null : 4.5),
      sellerSales:
        typeof p.sellerSales === "number"
          ? p.sellerSales
          : typeof p.seller?.sales === "number"
          ? (p.seller as RawSeller).sales!
          : (useDemoSeller ? null : 1),

      sellerId: useDemoSeller ? String(attachSellerId) : null,
    };
    return row;
  });
}

/* ============
   Main runner
   ============ */
async function main() {
  console.log("🔧 Seeding…");

  if (process.env.NODE_ENV === "production" && SEED_RESET && process.env.SEED_ALLOW_PROD !== "1") {
    throw new Error("Refusing to RESET in production. Set SEED_ALLOW_PROD=1 to force (dangerous).");
  }

  // 1) Demo seller (only fields that exist in your User schema)
  const demoSeller = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { name: DEMO_NAME, subscription: "GOLD", image: null },
    create: { email: DEMO_EMAIL, name: DEMO_NAME, subscription: "GOLD", image: null },
  });
  console.log(`✓ Demo seller: ${demoSeller.email} (${demoSeller.id})`);

  // 2) Load & expand
  const base = loadSeed();
  console.log(`• Loaded ${base.length} base products`);
  const expanded = makeAtLeast(base, SEED_MIN);
  console.log(`• Using ${expanded.length} products after expansion (min=${SEED_MIN})`);

  // 3) Build rows for createMany
  const rows: CreateRow[] = mapToCreateMany(expanded, demoSeller.id);

  // 4) Optional reset
  if (SEED_RESET) {
    console.log("⚠️  Resetting test data…");
    await prisma.favorite.deleteMany({});
    try { await (prisma as any).payment?.deleteMany?.({}); } catch {}
    await prisma.product.deleteMany({});
  }

  // 5) Insert in batches
  const BATCH = 250;
  let createdCount = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const res = await prisma.product.createMany({ data: slice, skipDuplicates: true });
    createdCount += res.count || 0;
    console.log(`  …batch ${Math.floor(i / BATCH) + 1}: +${res.count}`);
  }

  // 6) Seed favorites for demo seller
  const firstTwo = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    take: 2,
    select: { id: true },
  });
  for (const p of firstTwo) {
    await prisma.favorite.upsert({
      where: { userId_productId: { userId: demoSeller.id, productId: p.id } },
      update: {},
      create: { userId: demoSeller.id, productId: p.id },
    });
  }

  // 7) Summary
  const total = await prisma.product.count();
  console.log(`✅ Seed complete. Inserted: ${createdCount}. Total in DB: ${total}`);

  const sample = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { id: true, name: true, price: true, featured: true, sellerId: true },
  });
  console.log("• Sample:");
  for (const s of sample) {
    console.log(
      `  - ${s.id} :: ${s.name} :: KES ${s.price ?? "—"} :: ${s.featured ? "⭐" : "•"} :: seller=${s.sellerId ?? "anon"}`
    );
  }
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", (e as any)?.message || e);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } catch {}
  });
