// src/app/lib/prisma.ts
// Compatibility shim: forward to the central Prisma client and keep helper APIs.

import { prisma } from "@/lib/db";

export { prisma };

/* ------------------------------ Health helpers --------------------------- */
export async function prismaHealthcheck(): Promise<boolean> {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function prismaEnsureConnected(): Promise<void> {
  try {
    await prisma.$connect();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[prisma] connect error:", e);
  }
}

/** Optional alias for DI/tests (avoid importing PrismaClient type) */
export type DB = typeof prisma;
