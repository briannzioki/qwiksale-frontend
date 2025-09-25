// prisma/seed.js
/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/* =============================
   Config via environment vars
   =============================

   Default behavior: NO-OP (safe for production).

   Set the following only when you really intend to modify data:

   SEED_RESET=1             -> enable cleanup mode
   SEED_RESET_ALL=1         -> delete ALL marketplace rows (dangerous)
   SEED_PURGE_DEMO=1        -> delete known demo/test artifacts (safe-ish)
   SEED_DEMO_USER_EMAIL     -> email to target for demo purge (default seller@qwiksale.test)
   SEED_ALLOW_PROD=1        -> allow RESET/PURGE in production (danger!)
*/

const SEED_RESET = process.env.SEED_RESET === "1";
const SEED_RESET_ALL = process.env.SEED_RESET_ALL === "1";
const SEED_PURGE_DEMO = process.env.SEED_PURGE_DEMO === "1";
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

  // Locate demo/test user by email (if exists)
  const demoUser = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    select: { id: true },
  });

  if (demoUser?.id) {
    result.demoUserId = demoUser.id;

    // Remove favorites created by that user
    result.favoritesDeleted += (
      await prisma.favorite.deleteMany({ where: { userId: demoUser.id } })
    ).count;

    // Remove products owned by that user
    result.productsDeleted += (
      await prisma.product.deleteMany({ where: { sellerId: demoUser.id } })
    ).count;

    // Remove services owned by that user
    try {
      result.servicesDeleted += (
        await prisma.service.deleteMany({ where: { sellerId: demoUser.id } })
      ).count;
    } catch {
      // Service model may not exist yet — ignore
    }

    // Remove tickets/reports/other rows tied to that user
    result.ticketsDeleted += (
      await prisma.supportTicket.deleteMany({ where: { reporterId: demoUser.id } })
    ).count;

    result.reportsDeleted += (
      await prisma.report.deleteMany({ where: { userId: demoUser.id } })
    ).count;

    // Payments tied to that user
    result.paymentsDeleted += (
      await prisma.payment.deleteMany({ where: { userId: demoUser.id } })
    ).count;

    // Finally, remove the user
    result.userDeleted += (await prisma.user.deleteMany({ where: { id: demoUser.id } })).count;
  }

  // Remove any leftover “obviously demo” products (from old seeds)
  // - names containing "• Batch"
  // - sellerName "Private Seller"
  // (These filters are conservative to avoid touching real data.)
  result.productsDeleted += (
    await prisma.product.deleteMany({
      where: {
        OR: [
          { name: { contains: "• Batch" } },
          { sellerName: "Private Seller" },
        ],
      },
    })
  ).count;

  // Remove associated contact reveals for deleted products (best-effort)
  try {
    result.contactRevealsDeleted += (
      await prisma.contactReveal.deleteMany({
        where: {
          // if your DB keeps orphans this ensures cleanup; otherwise it will do nothing
          product: { equals: null },
        },
      })
    ).count;
  } catch {
    // Model might not be present — ignore
  }

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

  // Order matters due to FKs
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
   Main runner
   ============ */
async function main() {
  console.log("🔧 Seed (prod-safe): starting…");

  // By default do nothing (safe for production)
  if (!SEED_RESET && !SEED_PURGE_DEMO) {
    console.log("✅ No-op. (Set SEED_RESET=1 or SEED_PURGE_DEMO=1 to modify data.)");
    return;
  }

  // Guard destructive work in production unless explicitly allowed
  if (
    process.env.NODE_ENV === "production" &&
    process.env.SEED_ALLOW_PROD !== "1"
  ) {
    throw new Error(
      "Refusing to modify data in production. Set SEED_ALLOW_PROD=1 to proceed (DANGER)."
    );
  }

  // Purge demo/test artifacts (optional, safe-ish)
  if (SEED_PURGE_DEMO) {
    console.log("🧹 Purging demo/test artifacts…");
    const purged = await purgeDemoArtifacts();
    console.log("• Purge summary:", purged);
  }

  // Reset modes
  if (SEED_RESET) {
    if (SEED_RESET_ALL) {
      console.log("⚠️  SEED_RESET_ALL=1 -> wiping marketplace tables…");
      const wiped = await resetAllData();
      console.log("• Reset summary:", wiped);
    } else {
      console.log("ℹ️  SEED_RESET=1 (without ALL) -> nothing else to do (no demo data to target).");
      console.log("    Use SEED_PURGE_DEMO=1 if you want to remove known test artifacts.");
    }
  }

  // Final counts for visibility
  const productCount = await prisma.product.count();
  let serviceCount = 0;
  try {
    serviceCount = await prisma.service.count();
  } catch {}
  console.log(`📊 Totals -> products: ${productCount}, services: ${serviceCount}`);
  console.log("✅ Seed (prod-safe): complete.");
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
