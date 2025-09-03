// src/app/lib/prisma.ts
import { env, isDev, logDbTargetOnce } from "./env";

/**
 * One client per process in dev; fresh per invocation in serverless.
 * We load PrismaClient via runtime require so TS can compile even if the
 * generated client hasn't been built yet.
 */

/** Minimal surface we rely on, without importing Prisma types */
export type PrismaClientLike = {
  $connect?: () => Promise<void>;
  $disconnect?: () => Promise<void>;
  $queryRaw: <T = unknown>(...args: any[]) => Promise<T>;
  $use?: (mw: (params: any, next: (params: any) => Promise<any>) => Promise<any>) => void;
} & Record<string, any>;

type GlobalWithPrisma = typeof globalThis & {
  __PRISMA__?: PrismaClientLike;
  __PRISMA_SLOW_MW__?: boolean;
};

const g = globalThis as GlobalWithPrisma;

/** ---- Logging controls --------------------------------------------------- */
const LOG_QUERIES =
  process.env.PRISMA_LOG_QUERIES === "1" ||
  process.env.PRISMA_LOG_QUERIES === "true" ||
  process.env.DEBUG_PRISMA === "1";

const LOG_LEVELS = LOG_QUERIES
  ? (["query", "info", "warn", "error"] as const)
  : isDev
  ? (["info", "warn", "error"] as const)
  : (["warn", "error"] as const);

/** ---- Load PrismaClient ctor safely ------------------------------------- */
function getPrismaCtor(): new (...args: any[]) => PrismaClientLike {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("@prisma/client");
    if (!mod?.PrismaClient) {
      throw new Error("`@prisma/client` is installed but PrismaClient was not found.");
    }
    return mod.PrismaClient as new (...args: any[]) => PrismaClientLike;
  } catch (e: any) {
    const hint =
      "Install & generate the client:\n  npm i @prisma/client\n  npx prisma generate";
    throw new Error(
      `[prisma] Unable to load PrismaClient. ${hint}\nOriginal error: ${e?.message || e}`
    );
  }
}

/** ---- Client factory ----------------------------------------------------- */
function createClient(): PrismaClientLike {
  const PrismaClient = getPrismaCtor();

  // Be resilient if `env` isn't available in plain Node scripts
  const databaseUrl = (env as any)?.DATABASE_URL ?? process.env.DATABASE_URL ?? "";

  return new PrismaClient({
    datasources: databaseUrl ? { db: { url: databaseUrl } } : undefined,
    errorFormat: isDev ? "pretty" : "minimal",
    log: [...LOG_LEVELS],
  });
}

/** 🔹 Exported singleton (named export) */
export const prisma: PrismaClientLike = g.__PRISMA__ ?? createClient();

/** Cache the client in dev so hot-reloads don’t spawn new connections */
if (isDev) {
  g.__PRISMA__ = prisma;
  try {
    logDbTargetOnce?.();
  } catch {
    // optional helper; ignore if not available
  }
}

/** ---- Optional: slow query warning middleware (idempotent) --------------- */
if (!g.__PRISMA_SLOW_MW__) {
  const SLOW_MS = Number(process.env.PRISMA_SLOW_QUERY_MS ?? 2000);

  const maybeUse =
    (prisma as any).$use as
      | undefined
      | ((mw: (params: any, next: (params: any) => Promise<any>) => Promise<any>) => void);

  if (typeof maybeUse === "function") {
    maybeUse(async (params: any, next: (params: any) => Promise<any>) => {
      const start = Date.now();
      const result = await next(params);
      const ms = Date.now() - start;
      if (ms > SLOW_MS) {
        // eslint-disable-next-line no-console
        console.warn(`[prisma] slow ${params.model ?? "raw"}.${params.action} took ${ms}ms`);
      }
      return result;
    });
  }
  g.__PRISMA_SLOW_MW__ = true;
}

/** ---- Healthcheck helpers ------------------------------------------------ */
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
    await prisma.$connect?.();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[prisma] connect error:", e);
  }
}

/** Optional alias if you like DI in tests */
export type DB = PrismaClientLike;
