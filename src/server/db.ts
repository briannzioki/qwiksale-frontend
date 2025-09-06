// src/server/db.ts
import { PrismaClient } from "@prisma/client";

const ENV = process.env["NODE_ENV"] ?? "development";
const isDev = ENV === "development";

// Fail fast in dev if DB url is missing (easy to miss in local)
if (isDev && !process.env["DATABASE_URL"]) {
  // eslint-disable-next-line no-console
  console.warn(
    "[prisma] DATABASE_URL is not set. Set it in your .env to avoid runtime errors."
  );
}

// Optional: enable Prisma Data Proxy / Accelerate by env flag (unused here, kept for clarity)
const useDataProxy =
  process.env["PRISMA_ACCELERATE"] === "1" || process.env["PRISMA_DATA_PROXY"] === "1";
// Avoid lint warning if unused
void useDataProxy;

// Build options without assigning `undefined` to optional props
const prismaOptions: ConstructorParameters<typeof PrismaClient>[0] = {
  log: isDev ? ["query", "error", "warn"] : ["error"],
  // errorFormat: "minimal", // uncomment to shrink stack traces
  ...(process.env["DATABASE_URL"]
    ? { datasources: { db: { url: process.env["DATABASE_URL"] as string } } }
    : {}),
};

// In Data Proxy/Accelerate mode, PrismaClient receives different opts under the hood,
// but you can keep the same construction pattern.
function makeClient() {
  return new PrismaClient(prismaOptions);
}

// Use a global to prevent re-instantiation during HMR in dev
declare global {
  // eslint-disable-next-line no-var
  var __PRISMA__: PrismaClient | undefined;
}

export const prisma: PrismaClient = global.__PRISMA__ ?? makeClient();

if (isDev) {
  global.__PRISMA__ = prisma;
}

// Graceful shutdown: flush Prisma before process exits (Node only; no Edge)
if (typeof process !== "undefined" && (process as any).on) {
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    try {
      await prisma.$disconnect();
    } catch {
      /* noop */
    }
  };
  process.on("beforeExit", close);
  process.on("SIGINT", async () => {
    await close();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await close();
    process.exit(0);
  });
}
