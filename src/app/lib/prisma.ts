// src/app/lib/prisma.ts
import "server-only";
import { PrismaClient } from "@prisma/client";
import { env, isDev, logDbTargetOnce } from "./env";

/**
 * One PrismaClient per process in dev (prevents HMR connection storms).
 * In prod (serverless), a fresh client per invocation is fine; the platform
 * reuses warm instances so this is still efficient.
 */
type GlobalWithPrisma = typeof globalThis & {
  __PRISMA__?: PrismaClient;
  __PRISMA_SLOW_MW__?: boolean;
};

const g = globalThis as GlobalWithPrisma;

/** ---- Logging controls --------------------------------------------------- */
/**
 * Toggle query logging:
 *   PRISMA_LOG_QUERIES=1|true   -> include "query"
 *   DEBUG_PRISMA=1              -> include "query","info","warn","error"
 */
const LOG_QUERIES =
  process.env.PRISMA_LOG_QUERIES === "1" ||
  process.env.PRISMA_LOG_QUERIES === "true" ||
  process.env.DEBUG_PRISMA === "1";

const LOG_LEVELS = LOG_QUERIES
  ? (["query", "info", "warn", "error"] as const)
  : (isDev ? (["info", "warn", "error"] as const) : (["warn", "error"] as const));

/** ---- Client factory ----------------------------------------------------- */
function createClient() {
  return new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } }, // force-resolve URL from your env helper
    errorFormat: isDev ? "pretty" : "minimal",
    log: [...LOG_LEVELS],
  });
}

export const prisma = g.__PRISMA__ ?? createClient();

/** Cache the client in dev so hot-reloads don’t spawn new connections */
if (isDev) {
  g.__PRISMA__ = prisma;
  logDbTargetOnce();
}

/** ---- Optional: slow query warning middleware (idempotent) --------------- */
if (!g.__PRISMA_SLOW_MW__) {
  const SLOW_MS = Number(process.env.PRISMA_SLOW_QUERY_MS ?? 2000);
  prisma.$use(async (params, next) => {
    const start = Date.now();
    const result = await next(params);
    const ms = Date.now() - start;
    if (ms > SLOW_MS) {
      console.warn(
        `[prisma] slow ${params.model ?? "raw"}.${params.action} took ${ms}ms`
      );
    }
    return result;
  });
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

/** Optional eager connect (handy for long-lived runtimes) */
export async function prismaEnsureConnected(): Promise<void> {
  try {
    // No-op if already connected
    // @ts-ignore - $connect is safe to call repeatedly
    await prisma.$connect?.();
  } catch (e) {
    console.warn("[prisma] connect error:", e);
  }
}

// Re-export a handy type alias if you like DI in tests
export type DB = PrismaClient;
