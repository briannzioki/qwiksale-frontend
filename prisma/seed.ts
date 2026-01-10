/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/* =============================
   Config via environment vars
   =============================

   Default: NO-OP (safe for production).

   Existing flags:
   SEED_PURGE_DEMO=1        -> remove known demo/test artifacts
   SEED_DEMO_USER_EMAIL     -> email to target for demo purge (default seller@qwiksale.test)

   SEED_RESET=1             -> enable reset mode
   SEED_RESET_ALL=1         -> delete ALL marketplace rows (dangerous; implies SEED_RESET)

   SEED_DEMO=1              -> populate minimal demo data (includes optional demo carriers)
   SEED_CARRIERS_DEMO=1     -> populate only demo carriers (no listings)

   SEED_ALLOW_PROD=1        -> allow destructive ops in production (DANGER)

   Added for E2E stability:
   SEED_E2E_USERS=1         -> upsert E2E admin + user from env vars below (with passwordHash)
   SEED_E2E_FORCE_PASSWORD=1-> overwrite passwordHash even if already set (use carefully)

   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
   E2E_USER_EMAIL  / E2E_USER_PASSWORD
*/

const SEED_PURGE_DEMO = process.env.SEED_PURGE_DEMO === "1";
const SEED_RESET = process.env.SEED_RESET === "1" || process.env.SEED_RESET_ALL === "1";
const SEED_RESET_ALL = process.env.SEED_RESET_ALL === "1";
const SEED_DEMO = process.env.SEED_DEMO === "1";
const SEED_CARRIERS_DEMO = process.env.SEED_CARRIERS_DEMO === "1";
const DEMO_EMAIL = process.env.SEED_DEMO_USER_EMAIL || "seller@qwiksale.test";

const SEED_E2E_USERS = process.env.SEED_E2E_USERS === "1";
const SEED_E2E_FORCE_PASSWORD = process.env.SEED_E2E_FORCE_PASSWORD === "1";

const E2E_ADMIN_EMAIL = (process.env.E2E_ADMIN_EMAIL || process.env.E2E_SUPERADMIN_EMAIL || "").trim();
const E2E_ADMIN_PASSWORD = (process.env.E2E_ADMIN_PASSWORD || process.env.E2E_SUPERADMIN_PASSWORD || "").trim();
const E2E_USER_EMAIL = (process.env.E2E_USER_EMAIL || "").trim();
const E2E_USER_PASSWORD = (process.env.E2E_USER_PASSWORD || "").trim();

/* ============
   Helpers
   ============ */

function normalizeEmail(v: string) {
  return String(v || "").trim().toLowerCase();
}

function usernameFromEmail(email: string) {
  const local = normalizeEmail(email).split("@")[0] || "user";
  // Keep within your schema varchars and citext uniqueness.
  return local.replace(/[^a-z0-9._-]+/g, "-").slice(0, 32) || "user";
}

async function bcryptHash(plain: string, rounds = 10): Promise<string> {
  const pw = String(plain || "");
  if (!pw) throw new Error("Password is required.");
  return await new Promise<string>((resolve, reject) => {
    bcrypt.genSalt(rounds, (saltErr, salt) => {
      if (saltErr || !salt) return reject(saltErr ?? new Error("genSalt failed"));
      bcrypt.hash(pw, salt, (hashErr, hash) => {
        if (hashErr || !hash) return reject(hashErr ?? new Error("hash failed"));
        resolve(hash);
      });
    });
  });
}

type EnsureUserInput = {
  username?: string;
  email: string;
  name: string;
  location?: string;
  role?: "USER" | "MODERATOR" | "ADMIN" | "SUPERADMIN";
  passwordPlain?: string;
  forcePassword?: boolean;
};

async function ensureUser(input: EnsureUserInput) {
  const email = normalizeEmail(input.email);
  if (!email) throw new Error("ensureUser: email is required");

  const username = (input.username || usernameFromEmail(email)).trim();
  const role = input.role ?? "USER";
  const name = input.name?.trim() || username;
  const location = input.location ?? "Nairobi";

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });

  let passwordHash: string | undefined = undefined;
  const wantsPw = typeof input.passwordPlain === "string" && input.passwordPlain.trim().length > 0;

  if (wantsPw) {
    const shouldSet =
      input.forcePassword === true ||
      SEED_E2E_FORCE_PASSWORD ||
      !existing?.id ||
      !existing.passwordHash;

    if (shouldSet) {
      passwordHash = await bcryptHash(input.passwordPlain!.trim(), 10);
    }
  }

  if (existing?.id) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        // Keep username stable if already set; only fill if missing.
        username: undefined,
        name: name,
        location: location,
        verified: true,
        role: role,
        ...(passwordHash ? { passwordHash } : {}),
        updatedAt: new Date(),
      },
      select: { id: true, email: true, username: true, name: true, role: true },
    });
  }

  const now = new Date();
  return prisma.user.create({
    data: {
      email,
      username,
      name,
      verified: true,
      location,
      rating: 4.8,
      sales: 120,
      subscription: "BASIC",
      role,
      passwordHash: passwordHash ?? undefined,
      createdAt: now,
      updatedAt: now,
    },
    select: { id: true, email: true, username: true, name: true, role: true },
  });
}

/* ============
   Purge / reset
   ============ */

type PurgeSummary = {
  demoUserId: string | null;
  favoritesDeleted: number;
  productsDeleted: number;
  servicesDeleted: number;
  ticketsDeleted: number;
  reportsDeleted: number;
  paymentsDeleted: number;
  deliveryRequestsDeleted: number;
  carrierVehiclesDeleted: number;
  carrierProfilesDeleted: number;
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
  deliveryRequestsDeleted: number;
  carrierVehiclesDeleted: number;
  carrierProfilesDeleted: number;
  productsDeleted: number;
  servicesDeleted: number;
};

async function purgeDemoArtifacts(): Promise<PurgeSummary> {
  const summary: PurgeSummary = {
    demoUserId: null,
    favoritesDeleted: 0,
    productsDeleted: 0,
    servicesDeleted: 0,
    ticketsDeleted: 0,
    reportsDeleted: 0,
    paymentsDeleted: 0,
    deliveryRequestsDeleted: 0,
    carrierVehiclesDeleted: 0,
    carrierProfilesDeleted: 0,
    userDeleted: 0,
  };

  const demoUser = await prisma.user.findUnique({
    where: { email: normalizeEmail(DEMO_EMAIL) },
    select: { id: true },
  });

  if (demoUser?.id) {
    summary.demoUserId = demoUser.id;

    try {
      summary.deliveryRequestsDeleted += (
        await prisma.deliveryRequest.deleteMany({ where: { requesterId: demoUser.id } })
      ).count;
    } catch {}

    summary.favoritesDeleted += (await prisma.favorite.deleteMany({ where: { userId: demoUser.id } })).count;
    summary.productsDeleted += (await prisma.product.deleteMany({ where: { sellerId: demoUser.id } })).count;

    try {
      summary.servicesDeleted += (await prisma.service.deleteMany({ where: { sellerId: demoUser.id } })).count;
    } catch {}

    summary.ticketsDeleted += (await prisma.supportTicket.deleteMany({ where: { reporterId: demoUser.id } })).count;
    summary.reportsDeleted += (await prisma.report.deleteMany({ where: { userId: demoUser.id } })).count;
    summary.paymentsDeleted += (await prisma.payment.deleteMany({ where: { userId: demoUser.id } })).count;

    try {
      const carrier = await prisma.carrierProfile.findUnique({
        where: { userId: demoUser.id },
        select: { id: true },
      });

      if (carrier?.id) {
        summary.carrierVehiclesDeleted += (
          await prisma.carrierVehicle.deleteMany({ where: { carrierId: carrier.id } })
        ).count;

        summary.carrierProfilesDeleted += (
          await prisma.carrierProfile.deleteMany({ where: { id: carrier.id } })
        ).count;
      }
    } catch {}

    summary.userDeleted += (await prisma.user.deleteMany({ where: { id: demoUser.id } })).count;
  }

  summary.productsDeleted += (
    await prisma.product.deleteMany({
      where: {
        OR: [{ name: { contains: "• Batch" } }, { sellerName: "Private Seller" }],
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
    deliveryRequestsDeleted: 0,
    carrierVehiclesDeleted: 0,
    carrierProfilesDeleted: 0,
    productsDeleted: 0,
    servicesDeleted: 0,
  };

  summary.favoritesDeleted += (await prisma.favorite.deleteMany({})).count;

  try {
    summary.contactRevealsDeleted += (await prisma.contactReveal.deleteMany({})).count;
  } catch {}

  summary.ticketsDeleted += (await prisma.supportTicket.deleteMany({})).count;
  summary.reportsDeleted += (await prisma.report.deleteMany({})).count;

  try {
    summary.messagesDeleted += (await prisma.message.deleteMany({})).count;
    summary.threadsDeleted += (await prisma.thread.deleteMany({})).count;
  } catch {}

  try {
    summary.reviewsDeleted += (await prisma.review.deleteMany({})).count;
  } catch {}

  summary.paymentsDeleted += (await prisma.payment.deleteMany({})).count;

  try {
    summary.deliveryRequestsDeleted += (await prisma.deliveryRequest.deleteMany({})).count;
  } catch {}

  try {
    summary.carrierVehiclesDeleted += (await prisma.carrierVehicle.deleteMany({})).count;
    summary.carrierProfilesDeleted += (await prisma.carrierProfile.deleteMany({})).count;
  } catch {}

  summary.productsDeleted += (await prisma.product.deleteMany({})).count;

  try {
    summary.servicesDeleted += (await prisma.service.deleteMany({})).count;
  } catch {}

  return summary;
}

/* ============
   Carriers demo
   ============ */

async function ensureCarrierProfileForUser(args: {
  userId: string;
  phone?: string;
  planTier: "BASIC" | "GOLD" | "PLATINUM";
  verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  status: "OFFLINE" | "AVAILABLE" | "ON_TRIP";
  stationLabel: string;
  stationLat: number;
  stationLng: number;
  lastSeenLat: number;
  lastSeenLng: number;
}) {
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

async function ensureCarrierVehicle(args: {
  carrierId: string;
  type: "BICYCLE" | "MOTORBIKE" | "CAR" | "VAN" | "TRUCK";
  registration?: string;
  photoKeys?: string[];
}) {
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
      photoKeys: args.photoKeys ?? [],
      createdAt: now,
      updatedAt: now,
    },
    select: { id: true },
  });
}

async function populateDemoCarriersOnly() {
  console.log("🚚 Populating demo carriers…");

  const carriers = [
    {
      username: "demo-carrier",
      email: "carrier@qwiksale.test",
      name: "Demo Carrier",
      planTier: "BASIC" as const,
      verificationStatus: "PENDING" as const,
      status: "AVAILABLE" as const,
      vehicleType: "MOTORBIKE" as const,
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
      planTier: "GOLD" as const,
      verificationStatus: "VERIFIED" as const,
      status: "AVAILABLE" as const,
      vehicleType: "CAR" as const,
      registration: "KDL 778B",
      stationLabel: "Westlands",
      stationLat: -1.268,
      stationLng: 36.8119,
      lastSeenLat: -1.2672,
      lastSeenLng: 36.8132,
    },
    {
      username: "platinum-van",
      email: "platinum.van@qwiksale.test",
      name: "Platinum Van",
      planTier: "PLATINUM" as const,
      verificationStatus: "VERIFIED" as const,
      status: "AVAILABLE" as const,
      vehicleType: "VAN" as const,
      registration: "KDN 440C",
      stationLabel: "Kilimani",
      stationLat: -1.2921,
      stationLng: 36.7899,
      lastSeenLat: -1.2916,
      lastSeenLng: 36.7912,
    },
  ];

  for (const c of carriers) {
    const user = await ensureUser({
      username: c.username,
      email: c.email,
      name: c.name,
      location: "Nairobi",
    });

    const carrier = await ensureCarrierProfileForUser({
      userId: user.id,
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

  const totalCarriers = await prisma.carrierProfile.count();
  console.log(`✅ Demo carriers ready. Total carriers: ${totalCarriers}`);
}

/* ============
   E2E users
   ============ */

async function ensureE2EUsers() {
  console.log("🧪 Ensuring E2E users…");

  if (E2E_ADMIN_EMAIL && E2E_ADMIN_PASSWORD) {
    await ensureUser({
      email: E2E_ADMIN_EMAIL,
      username: usernameFromEmail(E2E_ADMIN_EMAIL),
      name: "E2E Admin",
      role: "ADMIN",
      passwordPlain: E2E_ADMIN_PASSWORD,
      forcePassword: SEED_E2E_FORCE_PASSWORD,
      location: "Nairobi",
    });
    console.log("✅ E2E admin ensured:", E2E_ADMIN_EMAIL);
  } else {
    console.log("ℹ️  Skipped E2E admin (missing E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD).");
  }

  if (E2E_USER_EMAIL && E2E_USER_PASSWORD) {
    await ensureUser({
      email: E2E_USER_EMAIL,
      username: usernameFromEmail(E2E_USER_EMAIL),
      name: "E2E User",
      role: "USER",
      passwordPlain: E2E_USER_PASSWORD,
      forcePassword: SEED_E2E_FORCE_PASSWORD,
      location: "Nairobi",
    });
    console.log("✅ E2E user ensured:", E2E_USER_EMAIL);
  } else {
    console.log("ℹ️  Skipped E2E user (missing E2E_USER_EMAIL/E2E_USER_PASSWORD).");
  }
}

/* ============
   Main
   ============ */

async function main() {
  console.log("🔧 Seed (prod-safe) starting…");

  if (
    !SEED_PURGE_DEMO &&
    !SEED_RESET &&
    !SEED_DEMO &&
    !SEED_CARRIERS_DEMO &&
    !SEED_E2E_USERS
  ) {
    console.log(
      "✅ No-op. (Set SEED_E2E_USERS=1 for test logins, or SEED_DEMO=1 / SEED_CARRIERS_DEMO=1 / SEED_PURGE_DEMO=1 / SEED_RESET=1 to modify data.)",
    );
    return;
  }

  if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_PROD !== "1") {
    throw new Error(
      "Refusing to modify data in production. Set SEED_ALLOW_PROD=1 to proceed (DANGER).",
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
      console.log("ℹ️  SEED_RESET=1 (without ALL) -> nothing else to do here.");
      console.log("    Tip: Use SEED_PURGE_DEMO=1 to remove known test artifacts.");
    }
  }

  if (SEED_E2E_USERS) {
    try {
      await ensureE2EUsers();
    } catch (e) {
      console.error("❌ E2E user ensure failed:", (e as any)?.message || e);
    }
  }

  if (SEED_DEMO || SEED_CARRIERS_DEMO) {
    try {
      await populateDemoCarriersOnly();
    } catch (e) {
      console.error("❌ Demo carriers failed:", (e as any)?.message || e);
    }
  }

  const productCount = await prisma.product.count();
  let serviceCount = 0;
  try {
    serviceCount = await prisma.service.count();
  } catch {}
  let carrierCount = 0;
  try {
    carrierCount = await prisma.carrierProfile.count();
  } catch {}

  console.log(
    `📊 Totals -> products: ${productCount}, services: ${serviceCount}, carriers: ${carrierCount}`,
  );
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
