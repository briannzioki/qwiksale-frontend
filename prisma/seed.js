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
   SEED_DEMO=1              -> populate minimal demo data (users + 1 product + 1 service + demo carriers)
   SEED_CARRIERS_DEMO=1     -> populate only demo carriers (no listings)
   SEED_DEMO_USER_EMAIL     -> email to use for demo seller (default seller@qwiksale.test)
   SEED_ALLOW_PROD=1        -> allow RESET/PURGE/DEMO in production (DANGER)
*/

const SEED_RESET = process.env.SEED_RESET === "1";
const SEED_RESET_ALL = process.env.SEED_RESET_ALL === "1";
const SEED_PURGE_DEMO = process.env.SEED_PURGE_DEMO === "1";
const SEED_DEMO = process.env.SEED_DEMO === "1";
const SEED_CARRIERS_DEMO = process.env.SEED_CARRIERS_DEMO === "1";
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
    deliveryRequestsDeleted: 0,
    carrierVehiclesDeleted: 0,
    carrierProfilesDeleted: 0,
    userDeleted: 0,
  };

  const demoUser = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    select: { id: true },
  });

  if (demoUser?.id) {
    result.demoUserId = demoUser.id;

    try {
      result.deliveryRequestsDeleted += (
        await prisma.deliveryRequest.deleteMany({ where: { requesterId: demoUser.id } })
      ).count;
    } catch {}

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

    try {
      const carrier = await prisma.carrierProfile.findUnique({
        where: { userId: demoUser.id },
        select: { id: true },
      });
      if (carrier?.id) {
        result.carrierVehiclesDeleted += (
          await prisma.carrierVehicle.deleteMany({ where: { carrierId: carrier.id } })
        ).count;
        result.carrierProfilesDeleted += (
          await prisma.carrierProfile.deleteMany({ where: { id: carrier.id } })
        ).count;
      }
    } catch {}

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
    deliveryRequestsDeleted: 0,
    carrierVehiclesDeleted: 0,
    carrierProfilesDeleted: 0,
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

  try {
    result.deliveryRequestsDeleted += (await prisma.deliveryRequest.deleteMany({})).count;
  } catch {}

  try {
    result.carrierVehiclesDeleted += (await prisma.carrierVehicle.deleteMany({})).count;
    result.carrierProfilesDeleted += (await prisma.carrierProfile.deleteMany({})).count;
  } catch {}

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
    select: { id: true, username: true, email: true },
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

async function ensureCarrierProfileForUser(args) {
  const existing = await prisma.carrierProfile.findUnique({
    where: { userId: args.userId },
    select: { id: true },
  });
  if (existing?.id) return existing;

  const now = new Date();
  return prisma.carrierProfile.create({
    data: {
      userId: args.userId,
      phone: args.phone,
      planTier: args.planTier,
      verificationStatus: args.verificationStatus,
      status: args.status,
      stationLabel: args.stationLabel,
      stationLat: args.stationLat,
      stationLng: args.stationLng,
      lastSeenAt: now,
      lastSeenLat: args.lastSeenLat,
      lastSeenLng: args.lastSeenLng,
      createdAt: now,
      updatedAt: now,
    },
    select: { id: true },
  });
}

async function ensureCarrierVehicle(args) {
  const existing = await prisma.carrierVehicle.findFirst({
    where: { carrierId: args.carrierId },
    select: { id: true },
  });
  if (existing?.id) return existing;

  const now = new Date();
  return prisma.carrierVehicle.create({
    data: {
      carrierId: args.carrierId,
      type: args.type,
      registration: args.registration,
      photoKeys: args.photoKeys || [],
      createdAt: now,
      updatedAt: now,
    },
    select: { id: true },
  });
}

async function populateDemoCarriers() {
  console.log("🚚 Populating demo carriers…");

  const carriers = [
    {
      username: "demo-carrier",
      email: "carrier@qwiksale.test",
      name: "Demo Carrier",
      planTier: "BASIC",
      verificationStatus: "PENDING",
      status: "AVAILABLE",
      vehicleType: "MOTORBIKE",
      registration: "KMG 123A",
      stationLabel: "Nairobi CBD",
      stationLat: -1.286389,
      stationLng: 36.817223,
      lastSeenLat: -1.2858,
      lastSeenLng: 36.8184,
    },
    {
      username: "gold-rider",
      email: "gold.rider@qwiksale.test",
      name: "Gold Rider",
      planTier: "GOLD",
      verificationStatus: "VERIFIED",
      status: "AVAILABLE",
      vehicleType: "CAR",
      registration: "KDL 778B",
      stationLabel: "Westlands",
      stationLat: -1.2680,
      stationLng: 36.8119,
      lastSeenLat: -1.2672,
      lastSeenLng: 36.8132,
    },
    {
      username: "platinum-van",
      email: "platinum.van@qwiksale.test",
      name: "Platinum Van",
      planTier: "PLATINUM",
      verificationStatus: "VERIFIED",
      status: "AVAILABLE",
      vehicleType: "VAN",
      registration: "KDN 440C",
      stationLabel: "Kilimani",
      stationLat: -1.2921,
      stationLng: 36.7899,
      lastSeenLat: -1.2916,
      lastSeenLng: 36.7912,
    },
  ];

  for (const c of carriers) {
    const u = await ensureUser({ username: c.username, email: c.email, name: c.name });
    const carrier = await ensureCarrierProfileForUser({
      userId: u.id,
      phone: "+254700000000",
      planTier: c.planTier,
      verificationStatus: c.verificationStatus,
      status: c.status,
      stationLabel: c.stationLabel,
      stationLat: c.stationLat,
      stationLng: c.stationLng,
      lastSeenLat: c.lastSeenLat,
      lastSeenLng: c.lastSeenLng,
    });

    await ensureCarrierVehicle({
      carrierId: carrier.id,
      type: c.vehicleType,
      registration: c.registration,
      photoKeys: ["/placeholder/default.jpg"],
    });
  }

  const total = await prisma.carrierProfile.count();
  console.log(`✅ Demo carriers ready. Total carriers: ${total}`);
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

  // carriers for /delivery testing
  try {
    await populateDemoCarriers();
  } catch (e) {
    console.log("ℹ️  Carriers demo skipped:", e?.message || e);
  }

  const [productCount, serviceCount, carrierCount] = await Promise.all([
    prisma.product.count(),
    prisma.service?.count?.() ?? 0,
    prisma.carrierProfile?.count?.() ?? 0,
  ]);
  console.log(
    `✅ Demo populate complete. Totals -> products: ${productCount}, services: ${serviceCount}, carriers: ${carrierCount}`
  );
}

/* ============
   Main runner
   ============ */
async function main() {
  console.log("🔧 Seed (prod-safe): starting…");

  // By default: NO-OP (safe in prod)
  if (!SEED_RESET && !SEED_PURGE_DEMO && !SEED_DEMO && !SEED_CARRIERS_DEMO) {
    console.log(
      "✅ No-op. (Set SEED_DEMO=1 to add demo data, SEED_CARRIERS_DEMO=1 to add carriers only, or SEED_RESET=1 / SEED_PURGE_DEMO=1 to modify data.)"
    );
    return;
  }

  // Guard destructive/modify ops in production unless explicitly allowed
  if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_PROD !== "1") {
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
  } else if (SEED_CARRIERS_DEMO) {
    await populateDemoCarriers();
  }

  const productCount = await prisma.product.count();
  const serviceCount = (await prisma.service?.count?.()) ?? 0;
  const carrierCount = (await prisma.carrierProfile?.count?.()) ?? 0;
  console.log(`📊 Totals -> products: ${productCount}, services: ${serviceCount}, carriers: ${carrierCount}`);
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
