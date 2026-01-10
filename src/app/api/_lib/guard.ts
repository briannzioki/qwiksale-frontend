import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import type { CarrierProfile } from "@prisma/client";
import { getSessionUser } from "@/app/lib/authz";
import { rateLimit } from "@/app/api/_lib/ratelimits";
import { clientKey } from "./request";

/**
 * Basic rate guard for any scope. Returns `Response` when limited,
 * or `null` to indicate “go ahead”.
 */
export async function guardRate(req: Request, scope: string) {
  const key = await clientKey(scope);
  const { success, reset } = await rateLimit.limit(key);
  if (!success) {
    return new Response("Slow down", {
      status: 429,
      headers: { "Retry-After": String(reset) },
    });
  }
  return null;
}

/**
 * Helper: only apply the limiter for write methods (POST/PATCH/DELETE).
 * Useful so public GETs (like /api/services/:id) are never throttled.
 */
export async function guardWriteRate(req: Request, scope: string) {
  const m = (req.method || "GET").toUpperCase();
  const isWrite = m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
  return isWrite ? guardRate(req, scope) : null;
}

/* =========================
   Auth guards for API routes
   ========================= */

type SessionUserLike = {
  id: string;
  email?: string | null;
  role?: string | null;
  name?: string | null;
};

type GuardOk<T> = { ok: true; value: T };
type GuardFail = { ok: false; res: Response };

function jsonNoStore(body: any, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

// Local prisma singleton (keeps this guard self-contained for new carrier/delivery routes)
const globalForPrisma = globalThis as unknown as { __QS_PRISMA__?: PrismaClient };
const prisma =
  globalForPrisma.__QS_PRISMA__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error"] : ["error"],
  });
if (!globalForPrisma.__QS_PRISMA__) globalForPrisma.__QS_PRISMA__ = prisma;

/**
 * Require a signed-in user for API routes.
 *
 * Returns:
 * - { ok: true, value: user } on success
 * - { ok: false, res: 401 Response } when not logged in
 */
export async function requireUserApi(): Promise<GuardOk<SessionUserLike> | GuardFail> {
  const user = (await getSessionUser()) as any;

  if (!user?.id) {
    return { ok: false, res: jsonNoStore({ error: "Unauthorized" }, 401) };
  }

  const safe: SessionUserLike = {
    id: String(user.id),
    email: user.email ?? null,
    role: user.role ?? null,
    name: user.name ?? null,
  };

  return { ok: true, value: safe };
}

/**
 * Require a carrier profile for API routes that mutate carrier state
 * or act on carrier-assigned requests.
 *
 * Enforces:
 * - carrier profile exists for this user
 * - not banned
 * - not suspended (suspendedUntil is null or in the past)
 *
 * Returns:
 * - { ok: true, value: { user, carrier } } on success
 * - { ok: false, res: 401/403 Response } when blocked
 */
export async function requireCarrierApi(): Promise<
  GuardOk<{ user: SessionUserLike; carrier: CarrierProfile }> | GuardFail
> {
  const u = await requireUserApi();
  if (!u.ok) return u;

  let carrier: CarrierProfile | null = null;
  try {
    carrier = await prisma.carrierProfile.findUnique({
      where: { userId: u.value.id },
    });
  } catch {
    // If the carrier tables are not migrated yet, treat as “no carrier profile”
    carrier = null;
  }

  if (!carrier) {
    return { ok: false, res: jsonNoStore({ error: "Carrier profile required" }, 403) };
  }

  if (carrier.bannedAt) {
    return {
      ok: false,
      res: jsonNoStore(
        {
          error: "Carrier banned",
          bannedAt: carrier.bannedAt,
          bannedReason: carrier.bannedReason ?? null,
        },
        403,
      ),
    };
  }

  if (carrier.suspendedUntil && carrier.suspendedUntil.getTime() > Date.now()) {
    return {
      ok: false,
      res: jsonNoStore(
        {
          error: "Carrier suspended",
          suspendedUntil: carrier.suspendedUntil,
        },
        403,
      ),
    };
  }

  return { ok: true, value: { user: u.value, carrier } };
}

/**
 * Wrapper for API handlers that must not be callable by guests.
 *
 * Usage:
 *   export const POST = rejectIfGuest(async (req, ctx, user) => { ... })
 */
export function rejectIfGuest<TCtx = any>(
  handler: (req: Request, ctx: TCtx, user: SessionUserLike) => Promise<Response> | Response,
) {
  return async (req: Request, ctx: TCtx) => {
    const u = await requireUserApi();
    if (!u.ok) return u.res;
    return handler(req, ctx, u.value);
  };
}

/**
 * Wrapper for API handlers that require an active, non-banned, non-suspended carrier.
 *
 * Usage:
 *   export const POST = requireCarrier(async (req, ctx, carrierCtx) => { ... })
 */
export function requireCarrier<TCtx = any>(
  handler: (
    req: Request,
    ctx: TCtx,
    carrierCtx: { user: SessionUserLike; carrier: CarrierProfile },
  ) => Promise<Response> | Response,
) {
  return async (req: Request, ctx: TCtx) => {
    const c = await requireCarrierApi();
    if (!c.ok) return c.res;
    return handler(req, ctx, c.value);
  };
}
