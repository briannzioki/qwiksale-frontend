/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* =============================
   Config via environment vars
   =============================

   Default: NO-OP (safe for production).

   Set the following only when you intend to modify data:

   SEED_PURGE_DEMO=1        -> remove known demo/test artifacts
   SEED_DEMO_USER_EMAIL     -> email to target for demo purge (default seller@qwiksale.test)

   SEED_RESET=1             -> enable reset mode
   SEED_RESET_ALL=1         -> delete ALL marketplace rows (dangerous; implies SEED_RESET)

   SEED_ALLOW_PROD=1        -> allow destructive ops in production (DANGER)
*/

const SEED_PURGE_DEMO = process.env.SEED_PURGE_DEMO === "1";
const SEED_RESET = process.env.SEED_RESET === "1" || process.env.SEED_RESET_ALL === "1";
const SEED_RESET_ALL = process.env.SEED_RESET_ALL === "1";
const DEMO_EMAIL = process.env.SEED_DEMO_USER_EMAIL || "seller@qwiksale.test";

/* ============
   Types
   ============ */
type PurgeSummary = {
  demoUserId: string | null;
  favoritesDeleted: number;
  productsDeleted: number;
  servicesDeleted: number;
  ticketsDeleted: number;
  reportsDeleted: number;
  paymentsDeleted: number;
  userDeleted: number;
};

type ResetSummary = {
  favoritesDeleted: number;
  contactRevealsDeleted: number;
  ticketsDeleted: number;
  reportsDeleted: number;
  messagesDeleted: number;
  threadsDeleted: number;
  reviewsDeleted: number;
  paymentsDeleted: number;
  productsDeleted: number;
  servicesDeleted: number;
};

/* ============
   Helpers
   ============ */

async function purgeDemoArtifacts(): Promise<PurgeSummary> {
  const summary: PurgeSummary = {
    demoUserId: null,
    favoritesDeleted: 0,
    productsDeleted: 0,
    servicesDeleted: 0,
    ticketsDeleted: 0,
    reportsDeleted: 0,
    paymentsDeleted: 0,
    userDeleted: 0,
  };

  // Find demo user by email (if present)
  const demoUser = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    select: { id: true },
  });

  if (demoUser?.id) {
    summary.demoUserId = demoUser.id;

    // Delete rows tied to demo user
    summary.favoritesDeleted += (await prisma.favorite.deleteMany({ where: { userId: demoUser.id } })).count;
    summary.productsDeleted += (await prisma.product.deleteMany({ where: { sellerId: demoUser.id } })).count;

    try {
      summary.servicesDeleted += (await prisma.service.deleteMany({ where: { sellerId: demoUser.id } })).count;
    } catch {
      // Service model may not exist in some schemas; ignore
    }

    summary.ticketsDeleted += (await prisma.supportTicket.deleteMany({ where: { reporterId: demoUser.id } })).count;
    summary.reportsDeleted += (await prisma.report.deleteMany({ where: { userId: demoUser.id } })).count;
    summary.paymentsDeleted += (await prisma.payment.deleteMany({ where: { userId: demoUser.id } })).count;

    // Finally delete demo user
    summary.userDeleted += (await prisma.user.deleteMany({ where: { id: demoUser.id } })).count;
  }

  // Clean up “obvious old seed” artifacts (conservative filters)
  summary.productsDeleted += (
    await prisma.product.deleteMany({
      where: {
        OR: [
          { name: { contains: "• Batch" } }, // from past clone-based seeds
          { sellerName: "Private Seller" },  // placeholder seller snapshot
        ],
      },
    })
  ).count;

  return summary;
}

async function resetAllData(): Promise<ResetSummary> {
  const summary: ResetSummary = {
    favoritesDeleted: 0,
    contactRevealsDeleted: 0,
    ticketsDeleted: 0,
    reportsDeleted: 0,
    messagesDeleted: 0,
    threadsDeleted: 0,
    reviewsDeleted: 0,
    paymentsDeleted: 0,
    productsDeleted: 0,
    servicesDeleted: 0,
  };

  // Order matters due to FKs and cascades
  summary.favoritesDeleted += (await prisma.favorite.deleteMany({})).count;

  try {
    summary.contactRevealsDeleted += (await prisma.contactReveal.deleteMany({})).count;
  } catch {
    // Model might not exist; ignore
  }

  summary.ticketsDeleted += (await prisma.supportTicket.deleteMany({})).count;
  summary.reportsDeleted += (await prisma.report.deleteMany({})).count;

  try {
    summary.messagesDeleted += (await prisma.message.deleteMany({})).count;
    summary.threadsDeleted += (await prisma.thread.deleteMany({})).count;
  } catch {
    // Messaging tables may not exist; ignore
  }

  try {
    summary.reviewsDeleted += (await prisma.review.deleteMany({})).count;
  } catch {
    // Reviews table may not exist; ignore
  }

  summary.paymentsDeleted += (await prisma.payment.deleteMany({})).count;

  summary.productsDeleted += (await prisma.product.deleteMany({})).count;

  try {
    summary.servicesDeleted += (await prisma.service.deleteMany({})).count;
  } catch {
    // Service table may not exist; ignore
  }

  return summary;
}

/* ============
   Main
   ============ */

async function main() {
  console.log("🔧 Seed (prod-safe) starting…");

  // Default is NO-OP
  if (!SEED_PURGE_DEMO && !SEED_RESET) {
    console.log("✅ No-op. (Set SEED_PURGE_DEMO=1 or SEED_RESET=1 to modify data.)");
    return;
  }

  // Guard destructive ops in production
  if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_PROD !== "1") {
    throw new Error(
      "Refusing to modify data in production. Set SEED_ALLOW_PROD=1 to proceed (DANGER)."
    );
  }

  // Optional: purge known demo/test artifacts
  if (SEED_PURGE_DEMO) {
    console.log("🧹 Purging demo/test artifacts…");
    const purged = await purgeDemoArtifacts();
    console.log("• Purge summary:", purged);
  }

  // Optional: reset data
  if (SEED_RESET) {
    if (SEED_RESET_ALL) {
      console.log("⚠️  SEED_RESET_ALL=1 -> wiping marketplace tables…");
      const wiped = await resetAllData();
      console.log("• Reset summary:", wiped);
    } else {
      console.log("ℹ️  SEED_RESET=1 (without ALL) -> nothing else to do here.");
      console.log("    Tip: Use SEED_PURGE_DEMO=1 to remove known test artifacts.");
    }
  }

  // Final visibility
  const productCount = await prisma.product.count();
  let serviceCount = 0;
  try {
    serviceCount = await prisma.service.count();
  } catch {}
  console.log(`📊 Totals -> products: ${productCount}, services: ${serviceCount}`);
  console.log("✅ Seed (prod-safe) complete.");
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
