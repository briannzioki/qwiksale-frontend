// src/app/api/admin/products/[id]/feature/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

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

// ----------------------------------------------------------------------------
// helpers
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function isAdminEmail(email?: string | null) {
  const raw = process.env.ADMIN_EMAILS || "";
  const set = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return !!email && set.has(email.toLowerCase());
}

// Next 15: params may be object or Promise
type CtxLike = { params?: { id: string } | Promise<{ id: string }> } | unknown;
async function getId(ctx: CtxLike): Promise<string> {
  const p: any = (ctx as any)?.params;
  const v = p && typeof p.then === "function" ? await p : p;
  return String(v?.id ?? "").trim();
}

function looksLikeId(id: string) {
  // Keep permissive: accept any non-empty string; tighten if you move to cuid/uuid
  return id.length > 0;
}

// ----------------------------------------------------------------------------
// PATCH /api/admin/products/[id]/feature
// body: { featured: boolean, force?: boolean }
export async function PATCH(req: NextRequest, ctx: CtxLike) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);

  try {
    // --- authN / authZ: admin only (env whitelist OR DB role === ADMIN) ---
    const session = await auth();
    const user = (session as any)?.user;

    if (!user?.id || !user?.email) {
      track("admin_product_feature_unauthorized", { reqId });
      return noStore({ error: "Unauthorized" }, { status: 401 });
    }

    let isAdmin = isAdminEmail(user.email);
    if (!isAdmin) {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { role: true },
      });
      isAdmin = dbUser?.role === "ADMIN";
    }
    if (!isAdmin) {
      track("admin_product_feature_forbidden", { reqId, userId: user.id });
      return noStore({ error: "Forbidden" }, { status: 403 });
    }

    // --- params ---
    const id = await getId(ctx);
    if (!looksLikeId(id)) {
      track("admin_product_feature_invalid_id", { reqId });
      return noStore({ error: "Missing or invalid id" }, { status: 400 });
    }

    // --- body ---
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      track("admin_product_feature_invalid_body", { reqId, reason: "invalid_json" });
      return noStore({ error: "Invalid JSON body." }, { status: 400 });
    }
    if (typeof body !== "object" || body === null) {
      track("admin_product_feature_invalid_body", { reqId, reason: "not_object" });
      return noStore({ error: "Body must be a JSON object." }, { status: 400 });
    }

    const { featured, force }: { featured?: unknown; force?: unknown } = body as any;

    if (typeof featured !== "boolean") {
      track("admin_product_feature_invalid_body", { reqId, reason: "featured_not_boolean" });
      return noStore({ error: "featured:boolean required" }, { status: 400 });
    }
    const allowNonActive = force === true;

    track("admin_product_feature_attempt", {
      reqId,
      userId: user.id,
      productId: id,
      featured,
      force: allowNonActive,
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
    if (!allowNonActive && prod.status !== "ACTIVE") {
      track("admin_product_feature_not_active_conflict", {
        reqId,
        productId: id,
        status: prod.status,
      });
      return noStore(
        {
          error:
            "Only ACTIVE products can be toggled. Pass force:true to override.",
          status: prod.status,
        },
        { status: 409 }
      );
    }

    // No-op: already in requested state
    if (prod.featured === featured) {
      track("admin_product_feature_no_change", {
        reqId,
        productId: id,
        featured,
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
      data: { featured },
      select: { id: true, featured: true, status: true, updatedAt: true },
    });

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
