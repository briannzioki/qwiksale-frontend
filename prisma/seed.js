/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/* =============================
   Config via environment vars
   =============================

   Default behavior: NO-OP (safe for production).

   Set these only when you intend to modify data:

   SEED_RESET=1             -> enable cleanup mode
   SEED_RESET_ALL=1         -> delete ALL marketplace rows (dangerous)
   SEED_PURGE_DEMO=1        -> delete known demo/test artifacts (safe-ish)
   SEED_DEMO=1              -> populate minimal demo data (users + 1 product + 1 service)
   SEED_DEMO_USER_EMAIL     -> email to use for demo seller (default seller@qwiksale.test)
   SEED_ALLOW_PROD=1        -> allow RESET/PURGE/DEMO in production (DANGER)
*/

const SEED_RESET = process.env.SEED_RESET === "1";
const SEED_RESET_ALL = process.env.SEED_RESET_ALL === "1";
const SEED_PURGE_DEMO = process.env.SEED_PURGE_DEMO === "1";
const SEED_DEMO = process.env.SEED_DEMO === "1"; // NEW
const DEMO_EMAIL = process.env.SEED_DEMO_USER_EMAIL || "seller@qwiksale.test";

/* ============
   Utilities
   ============ */

async function purgeDemoArtifacts() {
  const result = {
    demoUserId: null,
    productsDeleted: 0,
    servicesDeleted: 0,
    favoritesDeleted: 0,
    ticketsDeleted: 0,
    reportsDeleted: 0,
    paymentsDeleted: 0,
    contactRevealsDeleted: 0,
    userDeleted: 0,
  };

  const demoUser = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    select: { id: true },
  });

  if (demoUser?.id) {
    result.demoUserId = demoUser.id;

    result.favoritesDeleted += (
      await prisma.favorite.deleteMany({ where: { userId: demoUser.id } })
    ).count;

    result.productsDeleted += (
      await prisma.product.deleteMany({ where: { sellerId: demoUser.id } })
    ).count;

    try {
      result.servicesDeleted += (
        await prisma.service.deleteMany({ where: { sellerId: demoUser.id } })
      ).count;
    } catch {
      // Service model may not exist yet — ignore
    }

    result.ticketsDeleted += (
      await prisma.supportTicket.deleteMany({ where: { reporterId: demoUser.id } })
    ).count;

    result.reportsDeleted += (
      await prisma.report.deleteMany({ where: { userId: demoUser.id } })
    ).count;

    result.paymentsDeleted += (
      await prisma.payment.deleteMany({ where: { userId: demoUser.id } })
    ).count;

    result.userDeleted += (await prisma.user.deleteMany({ where: { id: demoUser.id } })).count;
  }

  // Conservative clean-up of obvious old demo rows
  result.productsDeleted += (
    await prisma.product.deleteMany({
      where: {
        OR: [{ name: { contains: "• Batch" } }, { sellerName: "Private Seller" }],
      },
    })
  ).count;

  // Best-effort orphan clean (may be a no-op on strict FK)
  try {
    result.contactRevealsDeleted += (
      await prisma.contactReveal.deleteMany({
        // This condition may be unsupported on some Prisma versions; ignore errors.
        where: { product: null },
      })
    ).count;
  } catch {}

  return result;
}

async function resetAllData() {
  const result = {
    favoritesDeleted: 0,
    paymentsDeleted: 0,
    contactRevealsDeleted: 0,
    ticketsDeleted: 0,
    reportsDeleted: 0,
    messagesDeleted: 0,
    threadsDeleted: 0,
    reviewsDeleted: 0,
    productsDeleted: 0,
    servicesDeleted: 0,
  };

  result.favoritesDeleted += (await prisma.favorite.deleteMany({})).count;

  try {
    result.contactRevealsDeleted += (await prisma.contactReveal.deleteMany({})).count;
  } catch {}

  result.ticketsDeleted += (await prisma.supportTicket.deleteMany({})).count;
  result.reportsDeleted += (await prisma.report.deleteMany({})).count;

  try {
    result.messagesDeleted += (await prisma.message.deleteMany({})).count;
    result.threadsDeleted += (await prisma.thread.deleteMany({})).count;
  } catch {}

  try {
    result.reviewsDeleted += (await prisma.review.deleteMany({})).count;
  } catch {}

  result.paymentsDeleted += (await prisma.payment.deleteMany({})).count;
  result.productsDeleted += (await prisma.product.deleteMany({})).count;

  try {
    result.servicesDeleted += (await prisma.service.deleteMany({})).count;
  } catch {}

  return result;
}

/* ============
   Demo populate
   ============ */

async function ensureUser({ username, email, name }) {
  // Upsert by unique email
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      username,
      name,
      verified: true,
      location: "Nairobi",
      rating: 4.8,
      sales: 123,
      subscription: "BASIC",
      role: "USER",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    select: { id: true, username: true },
  });
}

async function ensureProductFor(user, overrides = {}) {
  const existing = await prisma.product.findFirst({
    where: { sellerId: user.id },
    select: { id: true },
  });
  if (existing) return existing;

  const now = new Date();
  return prisma.product.create({
    data: {
      name: "Samsung Galaxy A14",
      description: "Gently used, great condition.",
      category: "Electronics",
      subcategory: "Phones & Tablets",
      brand: "Samsung",
      condition: "pre-owned",
      price: 13500,
      image: "/placeholder/default.jpg",
      gallery: ["/placeholder/default.jpg"],
      location: "Nairobi",
      negotiable: false,
      status: "ACTIVE",
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
      sellerId: user.id,

      // useful snapshots for cards
      sellerName: "Demo Seller",
      sellerPhone: undefined,
      sellerLocation: "Nairobi",
      sellerMemberSince: String(now.getFullYear() - 1),
      sellerRating: 4.8,
      sellerSales: 123,

      featured: true,
      ...overrides,
    },
    select: { id: true },
  });
}

async function ensureServiceFor(user, overrides = {}) {
  // If Service model is not present in the schema, skip gracefully
  if (!prisma.service?.create) return null;

  const existing = await prisma.service.findFirst({
    where: { sellerId: user.id },
    select: { id: true },
  });
  if (existing) return existing;

  const now = new Date();
  return prisma.service.create({
    data: {
      name: "Professional Plumbing",
      description: "Leak fixes, installations, and emergency callouts.",
      category: "Home Services",
      subcategory: "Plumbing",
      price: 1500,
      rateType: "fixed",
      image: "/placeholder/default.jpg",
      gallery: ["/placeholder/default.jpg"],
      location: "Nairobi",
      status: "ACTIVE",
      featured: true,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
      sellerId: user.id,

      // snapshots
      sellerName: "Pro Plumber",
      sellerLocation: "Nairobi",
      sellerMemberSince: String(now.getFullYear() - 2),
      sellerRating: 4.9,
      sellerSales: 210,

      ...overrides,
    },
    select: { id: true },
  });
}

async function populateDemo() {
  console.log("🌱 Populating minimal demo data…");

  // two sellers so “Visit store”/store pages and mixed feed work cleanly
  const demoSeller = await ensureUser({
    username: "demo-seller",
    email: DEMO_EMAIL,
    name: "Demo Seller",
  });
  const svcSeller = await ensureUser({
    username: "pro-plumber",
    email: "pro@qwiksale.test",
    name: "Pro Plumber",
  });

  await ensureProductFor(demoSeller);
  await ensureServiceFor(svcSeller);

  const [productCount, serviceCount] = await Promise.all([
    prisma.product.count(),
    prisma.service?.count?.() ?? 0,
  ]);
  console.log(`✅ Demo populate complete. Totals -> products: ${productCount}, services: ${serviceCount}`);
}

/* ============
   Main runner
   ============ */
async function main() {
  console.log("🔧 Seed (prod-safe): starting…");

  // By default: NO-OP (safe in prod)
  if (!SEED_RESET && !SEED_PURGE_DEMO && !SEED_DEMO) {
    console.log("✅ No-op. (Set SEED_DEMO=1 to add demo data, or SEED_RESET=1 / SEED_PURGE_DEMO=1 to modify data.)");
    return;
  }

  // Guard destructive/modify ops in production unless explicitly allowed
  if (
    process.env.NODE_ENV === "production" &&
    process.env.SEED_ALLOW_PROD !== "1"
  ) {
    throw new Error(
      "Refusing to modify data in production. Set SEED_ALLOW_PROD=1 to proceed (DANGER)."
    );
  }

  if (SEED_PURGE_DEMO) {
    console.log("🧹 Purging demo/test artifacts…");
    const purged = await purgeDemoArtifacts();
    console.log("• Purge summary:", purged);
  }

  if (SEED_RESET) {
    if (SEED_RESET_ALL) {
      console.log("⚠️  SEED_RESET_ALL=1 -> wiping marketplace tables…");
      const wiped = await resetAllData();
      console.log("• Reset summary:", wiped);
    } else {
      console.log("ℹ️  SEED_RESET=1 (without ALL) -> nothing else to do. Use SEED_PURGE_DEMO=1 for targeted cleanup.");
    }
  }

  if (SEED_DEMO) {
    await populateDemo();
  }

  const productCount = await prisma.product.count();
  const serviceCount = (await prisma.service?.count?.()) ?? 0;
  console.log(`📊 Totals -> products: ${productCount}, services: ${serviceCount}`);
  console.log("✅ Seed: complete.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e?.message || e);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } catch {}
  });
