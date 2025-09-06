import { env, isDev, logDbTargetOnce } from "./env";
import type { PrismaClient as PrismaClientType, Prisma } from "@prisma/client";

/**
 * One PrismaClient per process in dev; fresh per invocation in serverless.
 * We avoid strict middleware typings to be compatible across client versions.
 */

type GlobalWithPrisma = typeof globalThis & {
  __PRISMA__?: PrismaClientType;
  __PRISMA_SLOW_MW__?: boolean;
};

const g = globalThis as GlobalWithPrisma;

/* ------------------------------- Logging -------------------------------- */
const LOG_QUERIES =
  process.env["PRISMA_LOG_QUERIES"] === "1" ||
  process.env["PRISMA_LOG_QUERIES"] === "true" ||
  process.env["DEBUG_PRISMA"] === "1";

const LOG_LEVELS: Prisma.LogLevel[] = LOG_QUERIES
  ? ["query", "info", "warn", "error"]
  : isDev
  ? ["info", "warn", "error"]
  : ["warn", "error"];

/* ---------------------- Load PrismaClient constructor -------------------- */
function getPrismaCtor(): new (args?: Prisma.PrismaClientOptions) => PrismaClientType {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("@prisma/client") as {
      PrismaClient?: new (args?: Prisma.PrismaClientOptions) => PrismaClientType;
    };
    if (!mod?.PrismaClient) throw new Error("PrismaClient not found in @prisma/client");
    return mod.PrismaClient!;
  } catch (e: any) {
    const hint =
      "Make sure @prisma/client is installed and generated:\n  npm i @prisma/client\n  npx prisma generate";
    throw new Error(`[prisma] Unable to load PrismaClient.\n${hint}\nOriginal error: ${e?.message || e}`);
  }
}

/* -------------------------------- Factory -------------------------------- */
function createClient(): PrismaClientType {
  const PrismaClient = getPrismaCtor();
  const databaseUrl = env.DATABASE_URL || process.env["DATABASE_URL"] || "";

  // Build options without putting `datasources: undefined` on the object.
  const options: Prisma.PrismaClientOptions = {
    errorFormat: isDev ? "pretty" : "minimal",
    log: LOG_LEVELS,
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
  };

  return new PrismaClient(options);
}

/* ----------------------------- Singleton export -------------------------- */
export const prisma: PrismaClientType = g.__PRISMA__ ?? createClient();

if (isDev) {
  g.__PRISMA__ = prisma;
  try {
    logDbTargetOnce?.();
  } catch {
    /* noop */
  }
}

/* --------------- Optional: slow query warning middleware ----------------- */
/**
 * Some Prisma versions/environments don’t surface the Middleware type or $use
 * in a way TS can see. We attach via a safe cast to avoid TS friction while
 * keeping the runtime behavior.
 */
if (!g.__PRISMA_SLOW_MW__) {
  const SLOW_MS = Number(process.env["PRISMA_SLOW_QUERY_MS"] ?? 2000);

  const anyClient = prisma as unknown as {
    $use?: (mw: (params: any, next: (params: any) => Promise<any>) => Promise<any>) => void;
  };

  if (typeof anyClient.$use === "function") {
    anyClient.$use(async (params: any, next: (params: any) => Promise<any>) => {
      const started = Date.now();
      const result = await next(params);
      const ms = Date.now() - started;
      if (ms > SLOW_MS) {
        // eslint-disable-next-line no-console
        console.warn(`[prisma] slow ${params?.model ?? "raw"}.${params?.action} took ${ms}ms`);
      }
      return result;
    });
  }
  g.__PRISMA_SLOW_MW__ = true;
}

/* ------------------------------ Health helpers --------------------------- */
export async function prismaHealthcheck(): Promise<boolean> {
  try {
    // Unsafe is fine for a fixed constant; avoids template literal quirks
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

/** Optional alias for DI/tests */
export type DB = PrismaClientType;
