// tests/e2e/_helpers/prisma.ts
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __e2e_prisma: PrismaClient | undefined;
}

export const e2ePrisma: PrismaClient =
  globalThis.__e2e_prisma ?? new PrismaClient();

if (!globalThis.__e2e_prisma) {
  globalThis.__e2e_prisma = e2ePrisma;
}

export async function e2ePrismaDisconnect() {
  try {
    await e2ePrisma.$disconnect();
  } catch {
    // ignore
  }
}
