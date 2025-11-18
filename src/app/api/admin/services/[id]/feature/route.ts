// src/app/api/admin/services/[id]/feature/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { assertAdmin } from "@/app/api/admin/_lib/guard";

/* ---------------- analytics (console-only) ---------------- */

type AnalyticsEvent =
  | "admin_service_feature_attempt"
  | "admin_service_feature_forbidden"
  | "admin_service_feature_invalid_id"
  | "admin_service_feature_invalid_body"
  | "admin_service_feature_not_found"
  | "admin_service_feature_not_active_conflict"
  | "admin_service_feature_no_change"
  | "admin_service_feature_success"
  | "admin_service_feature_error";

function track(event: AnalyticsEvent, props?: Record<string, unknown>) {
  try {
    // eslint-disable-next-line no-console
    console.log(`[track] ${event}`, {
      ts: new Date().toISOString(),
      ...props,
    });
  } catch {
    /* noop */
  }
}

/* --------------------------------- utils --------------------------------- */

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate"
  );
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set(
    "Vary",
    "Authorization, Cookie, Accept-Encoding"
  );
  return res;
}

type RouteParams = { id: string };
type RouteContext = { params: Promise<RouteParams> };

function looksLikeId(id: string) {
  return id.trim().length > 0;
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

function getServiceModel() {
  const any = prisma as any;
  return any.service ?? any.Service ?? null;
}

/* --------------- PATCH /api/admin/services/[id]/feature --------------- */
/**
 * Body: { featured: boolean; force?: boolean }
 * Also accepts query overrides: ?featured=true&force=1
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);

  try {
    const denied = await assertAdmin();
    if (denied) {
      track("admin_service_feature_forbidden", { reqId });
      return denied;
    }

    const Service = getServiceModel();
    if (!Service?.findUnique || !Service?.update) {
      track("admin_service_feature_error", {
        reqId,
        reason: "Service model missing",
      });
      return noStore(
        { error: "Service model not available" },
        { status: 500 }
      );
    }

    const session = await auth().catch(() => null);
    const userId = (session?.user as any)?.id as string | undefined;

    const { id: rawId } = await ctx.params;
    const id = String(rawId || "").trim();
    if (!looksLikeId(id)) {
      track("admin_service_feature_invalid_id", { reqId });
      return noStore({ error: "Missing or invalid id" }, { status: 400 });
    }

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      /* allow missing JSON */
    }

    const q = req.nextUrl.searchParams;
    const featuredQ = q.get("featured");
    const forceQ = q.get("force");

    const featuredBody = body?.featured as unknown;
    const forceBody = body?.force as unknown;

    const featuredParsed = parseBoolean(featuredBody ?? featuredQ);
    const forceParsed = parseBoolean(forceBody ?? forceQ) === true;

    if (typeof featuredParsed !== "boolean") {
      track("admin_service_feature_invalid_body", {
        reqId,
        reason: "featured_not_boolean",
      });
      return noStore({ error: "featured:boolean required" }, { status: 400 });
    }

    track("admin_service_feature_attempt", {
      reqId,
      userId: userId ?? "unknown",
      serviceId: id,
      featured: featuredParsed,
      force: forceParsed,
    });

    const svc = await Service.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        featured: true,
        updatedAt: true,
      },
    });

    if (!svc) {
      track("admin_service_feature_not_found", {
        reqId,
        serviceId: id,
      });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    if (!forceParsed && svc.status !== "ACTIVE") {
      track("admin_service_feature_not_active_conflict", {
        reqId,
        serviceId: id,
        status: svc.status,
      });
      return noStore(
        {
          error:
            "Only ACTIVE services can be toggled. Pass force:true to override.",
          status: svc.status,
        },
        { status: 409 }
      );
    }

    if (svc.featured === featuredParsed) {
      track("admin_service_feature_no_change", {
        reqId,
        serviceId: id,
        featured: featuredParsed,
      });
      return noStore({
        ok: true,
        noChange: true,
        service: {
          id: svc.id,
          featured: svc.featured,
          status: svc.status,
        },
      });
    }

    const updated = await Service.update({
      where: { id },
      data: { featured: featuredParsed },
      select: {
        id: true,
        featured: true,
        status: true,
        updatedAt: true,
      },
    });

    try {
      await (prisma as any).adminAuditLog?.create?.({
        data: {
          actorId: userId ?? null,
          action: "SERVICE_FEATURE_TOGGLE",
          meta: {
            serviceId: id,
            before: {
              featured: svc.featured,
              status: svc.status,
            },
            after: {
              featured: updated.featured,
              status: updated.status,
            },
            reqId,
          },
        },
      });
    } catch {
      /* ignore optional audit table */
    }

    track("admin_service_feature_success", {
      reqId,
      serviceId: id,
      featured: updated.featured,
      status: updated.status,
    });

    return noStore({ ok: true, service: updated });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[admin/services/:id/feature PATCH] error:", e);
    track("admin_service_feature_error", {
      reqId,
      message: (e as any)?.message ?? String(e),
    });
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* ----------- CORS / health helpers ----------- */

export async function OPTIONS() {
  return noStore({ ok: true }, { status: 204 });
}

/**
 * Admin-only probe for this route.
 */
export async function GET() {
  const denied = await assertAdmin();
  if (denied) return denied;
  return noStore({ ok: true, method: "GET" }, { status: 200 });
}
