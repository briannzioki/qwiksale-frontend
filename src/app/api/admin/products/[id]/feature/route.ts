// src/app/api/admin/products/[id]/feature/route.ts
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { assertAdmin } from "@/app/api/admin/_lib/guard";

/* ---------------- analytics (console-only for now) ---------------- */
type AnalyticsEvent =
  | "admin_product_feature_attempt"
  | "admin_product_feature_unauthorized"
  | "admin_product_feature_forbidden"
  | "admin_product_feature_invalid_id"
  | "admin_product_feature_invalid_body"
  | "admin_product_feature_not_found"
  | "admin_product_feature_not_active_conflict"
  | "admin_product_feature_no_change"
  | "admin_product_feature_success"
  | "admin_product_feature_error";

function track(event: AnalyticsEvent, props?: Record<string, unknown>) {
  try {
    // eslint-disable-next-line no-console
    console.log(`[track] ${event}`, { ts: new Date().toISOString(), ...props });
  } catch {
    /* noop */
  }
}

/* --------------------------------- utils --------------------------------- */

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
  return res;
}

type RouteParams = { id: string };
/** Next 15 validator expects params to be Promise<RouteParams> */
type RouteContext = { params: Promise<RouteParams> };

function looksLikeId(id: string) {
  // Keep permissive unless you enforce cuid/uuid. Non-empty is fine here.
  return id.length > 0;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const t = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(t)) return true;
    if (["0", "false", "no", "off"].includes(t)) return false;
  }
  return undefined;
}

/* ----------------- PATCH /api/admin/products/[id]/feature ----------------- */
// body: { featured: boolean; force?: boolean }
// Also accepts query overrides: ?featured=true&force=1 (handy for quick tests)
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);

  try {
    // --- admin guard (single source of truth) ---
    const denied = await assertAdmin();
    if (denied) return denied;

    // Session only needed for audit/userId after guard passes
    const session = await auth().catch(() => null);
    const userId = (session?.user as any)?.id as string | undefined;

    // --- params ---
    const { id: rawId } = await ctx.params;
    const id = String(rawId || "").trim();
    if (!looksLikeId(id)) {
      track("admin_product_feature_invalid_id", { reqId });
      return noStore({ error: "Missing or invalid id" }, { status: 400 });
    }

    // --- body / query ---
    // Accept input both from JSON body and query string for convenience
    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      /* Allow empty/invalid JSON when using query params */
    }

    const q = req.nextUrl.searchParams;
    const featuredQ = q.get("featured");
    const forceQ = q.get("force");

    const featuredBody = (body as any)?.featured as unknown;
    const forceBody = (body as any)?.force as unknown;

    const featuredParsed = parseBoolean(featuredBody ?? featuredQ);
    const forceParsed = parseBoolean(forceBody ?? forceQ) === true; // default false

    if (typeof featuredParsed !== "boolean") {
      track("admin_product_feature_invalid_body", {
        reqId,
        reason: "featured_not_boolean",
      });
      return noStore({ error: "featured:boolean required" }, { status: 400 });
    }

    track("admin_product_feature_attempt", {
      reqId,
      userId: userId ?? "unknown",
      productId: id,
      featured: featuredParsed,
      force: forceParsed,
    });

    // --- load product (validate existence & status) ---
    const prod = await prisma.product.findUnique({
      where: { id },
      select: { id: true, status: true, featured: true, updatedAt: true },
    });
    if (!prod) {
      track("admin_product_feature_not_found", { reqId, productId: id });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    // By default, only ACTIVE products can be toggled
    if (!forceParsed && prod.status !== "ACTIVE") {
      track("admin_product_feature_not_active_conflict", {
        reqId,
        productId: id,
        status: prod.status,
      });
      return noStore(
        {
          error: "Only ACTIVE products can be toggled. Pass force:true to override.",
          status: prod.status,
        },
        { status: 409 }
      );
    }

    // No-op: already in requested state
    if (prod.featured === featuredParsed) {
      track("admin_product_feature_no_change", {
        reqId,
        productId: id,
        featured: featuredParsed,
      });
      return noStore({
        ok: true,
        noChange: true,
        product: { id: prod.id, featured: prod.featured, status: prod.status },
      });
    }

    // --- update ---
    const updated = await prisma.product.update({
      where: { id },
      data: { featured: featuredParsed },
      select: { id: true, featured: true, status: true, updatedAt: true },
    });

    // Optional: write an audit log row if your schema supports it
    try {
      await (prisma as any).adminAuditLog?.create?.({
        data: {
          actorId: userId ?? null,
          action: "PRODUCT_FEATURE_TOGGLE",
          meta: {
            productId: id,
            before: { featured: prod.featured, status: prod.status },
            after: { featured: updated.featured, status: updated.status },
            reqId,
          },
        },
      });
    } catch {
      /* ignore if table not present */
    }

    track("admin_product_feature_success", {
      reqId,
      productId: id,
      featured: updated.featured,
      status: updated.status,
    });

    return noStore({ ok: true, product: updated });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[admin/products/:id/feature PATCH] error:", e);
    track("admin_product_feature_error", {
      reqId,
      message: (e as any)?.message ?? String(e),
    });
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* ----------- Minimal CORS/health helpers (optional but handy) ----------- */
export async function OPTIONS() {
  return noStore({ ok: true }, { status: 204 });
}
export async function GET() {
  return noStore({ ok: true, method: "GET" }, { status: 200 });
}
