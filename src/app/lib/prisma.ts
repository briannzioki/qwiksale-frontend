// src/app/lib/prisma.ts
// Node-only shim: forwards to the central Prisma client in src/lib/db.ts.
// Safe for server components and route handlers; avoid from Edge.

import "server-only";
import prismaFromDb from "@/lib/db";

type PrismaFromDb = typeof prismaFromDb;

declare global {
  // eslint-disable-next-line no-var
  var __qwiksale_app_prisma: PrismaFromDb | undefined;
}

// In dev (and Playwright runs using dev server), module reloads can cause multiple clients.
// Cache on globalThis to prevent connection-pool explosions even if the upstream import changes.
const prisma: PrismaFromDb = globalThis.__qwiksale_app_prisma ?? prismaFromDb;

if (process.env.NODE_ENV !== "production") {
  globalThis.__qwiksale_app_prisma = prisma;
}

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
