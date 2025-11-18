// src/lib/db.ts
// Central Prisma client for Node runtimes.
// Do not import this from Edge / runtime="edge" modules.

import { PrismaClient } from "@prisma/client";

const isDev = process.env["NODE_ENV"] === "development";

const globalForPrisma = globalThis as unknown as {
  __PRISMA__?: PrismaClient;
};

const prisma =
  globalForPrisma.__PRISMA__ ??
  new PrismaClient({
    log: isDev ? ["query", "error", "warn"] : ["error"],
  });

if (isDev) {
  globalForPrisma.__PRISMA__ = prisma;
}

export { prisma };
export type DB = PrismaClient;
export default prisma;
