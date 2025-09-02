// src/app/lib/prisma.ts
import { PrismaClient } from "@prisma/client";
import { env, isDev, logDbTargetOnce } from "./env";

/**
 * One PrismaClient per process in dev (prevents HMR connection storms).
 * In prod (serverless), a fresh client per invocation is fine; the platform
 * reuses warm instances so this is still efficient.
 */

declare global {
  // eslint-disable-next-line no-var
  var __PRISMA__: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __PRISMA_SLOW_MW__: boolean | undefined;
}

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

/** ---- Client factory ----------------------------------------------------- */
function createClient() {
  // Be resilient if `env` isn’t available in plain Node scripts
  const databaseUrl =
    (env as any)?.DATABASE_URL ?? process.env.DATABASE_URL ?? "";

  return new PrismaClient({
    datasources: databaseUrl ? { db: { url: databaseUrl } } : undefined,
    errorFormat: isDev ? "pretty" : "minimal",
    log: [...LOG_LEVELS],
  });
}

export const prisma = globalThis.__PRISMA__ ?? createClient();

/** Cache the client in dev so hot-reloads don’t spawn new connections */
if (isDev) {
  globalThis.__PRISMA__ = prisma;
  try {
    logDbTargetOnce?.();
  } catch {
    // optional helper; ignore if not available
  }
}

/** ---- Optional: slow query warning middleware (idempotent) --------------- */
if (!globalThis.__PRISMA_SLOW_MW__) {
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
        console.warn(
          `[prisma] slow ${params.model ?? "raw"}.${params.action} took ${ms}ms`
        );
      }
      return result;
    });
  }
  globalThis.__PRISMA_SLOW_MW__ = true;
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

// Re-export a handy type alias if you like DI in tests
export type DB = PrismaClient;
