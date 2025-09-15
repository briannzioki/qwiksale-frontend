// src/lib/db.ts
// Central Prisma client that does NOT import from '@prisma/client' at type time.
// This avoids TS2305/namespace export issues across TS moduleResolution modes.

type PrismaClientType = any; // keep loose to avoid TS friction in this infra file

type GlobalWithPrisma = typeof globalThis & { __PRISMA__?: PrismaClientType };
const g = globalThis as GlobalWithPrisma;

/** Load the PrismaClient constructor at runtime only */
function getPrismaCtor(): new (args?: any) => PrismaClientType {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("@prisma/client") as { PrismaClient?: new (args?: any) => PrismaClientType };
    if (!mod?.PrismaClient) throw new Error("PrismaClient not found in @prisma/client");
    return mod.PrismaClient!;
  } catch (e: any) {
    throw new Error(
      `[prisma] Unable to load PrismaClient. Ensure @prisma/client is installed and 'prisma generate' has run.\n` +
      `Original error: ${e?.message || e}`
    );
  }
}

/** Create a new Prisma client instance */
function createClient(): PrismaClientType {
  const PrismaClient = getPrismaCtor();
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

/** Singleton in dev; fresh per process otherwise */
export const prisma: PrismaClientType = g.__PRISMA__ ?? createClient();

if (process.env.NODE_ENV !== "production") {
  g.__PRISMA__ = prisma;
}

/** Convenience types (intentionally broad) */
export type DB = PrismaClientType;
