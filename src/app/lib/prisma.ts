// src/app/lib/prisma.ts
// Node-only shim: forwards to the central Prisma client in src/lib/db.ts.
// Safe for server components and route handlers; avoid from Edge.

import "server-only";
import prisma from "@/lib/db";

export { prisma };

/* ------------------------------ Health helpers --------------------------- */
export async function prismaHealthcheck(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
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

/** Optional alias for DI/tests */
export type DB = typeof prisma;
