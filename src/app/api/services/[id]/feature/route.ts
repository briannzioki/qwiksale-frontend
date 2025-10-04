// src/app/api/services/[id]/feature/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

/* ---------------- tiny utils ---------------- */

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding, Origin");
  return res;
}

/** Resolve id from promised route params, with URL fallback. */
async function getId(
  req: NextRequest,
  paramsPromise?: Promise<{ id: string }>
) {
  // Try the (promised) route params first
  try {
    const p = await paramsPromise;
    const idFromParams = (p?.id ?? "").trim();
    if (idFromParams) return idFromParams;
  } catch {
    /* ignore and fall back to URL parse */
  }

  // Fall back to parsing the URL path
  try {
    const segs = req.nextUrl?.pathname?.split("/") ?? [];
    const i = segs.findIndex((s) => s === "services");
    return (segs[i + 1] ?? "").trim();
  } catch {
    return "";
  }
}

/** Admin allow-list from env (comma-separated emails) or DB role. */
function isAdminEmail(email?: string | null) {
  const raw = process.env["ADMIN_EMAILS"] || "";
  const set = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return !!email && set.has(email.toLowerCase());
}

function parseBoolean(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(t)) return true;
    if (["0", "false", "no", "off"].includes(t)) return false;
  }
  return undefined;
}

/* ---------------- GET /api/services/[id]/feature ---------------- */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const id = await getId(req, context?.params);
  if (!id) return noStore({ error: "Missing id" }, { status: 400 });

  try {
    const service = await prisma.service.findUnique({
      where: { id },
      select: { id: true, name: true, status: true, featured: true, updatedAt: true },
    });

    if (!service) return noStore({ error: "Not found" }, { status: 404 });
    return noStore({ ok: true, service });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[services/:id/feature GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* --------------- PATCH /api/services/[id]/feature --------------- */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  // --- authN / authZ ---
  let session: any = null;
  try {
    session = await auth();
  } catch {
    /* ignore */
  }
  const user = session?.user;
  if (!user?.id || !user?.email) return noStore({ error: "Unauthorized" }, { status: 401 });

  let isAdmin = isAdminEmail(user.email);
  if (!isAdmin) {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    });
    isAdmin = dbUser?.role === "ADMIN";
  }
  if (!isAdmin) return noStore({ error: "Forbidden" }, { status: 403 });

  // --- params ---
  const id = await getId(req, context?.params);
  if (!id) return noStore({ error: "Missing id" }, { status: 400 });

  // --- body / query ---
  let body: any = null;
  const ctype = (req.headers.get("content-type") || "").toLowerCase();
  if (ctype.includes("application/json")) {
    body = await req.json().catch(() => ({}));
  } else {
    body = {};
  }

  const q = req.nextUrl.searchParams;
  const featuredQ = q.get("featured");
  const forceQ = q.get("force");

  const featuredParsed = parseBoolean((body as any)?.featured ?? featuredQ);
  const forceParsed = parseBoolean((body as any)?.force ?? forceQ) === true;

  if (typeof featuredParsed !== "boolean") {
    return noStore({ error: "featured:boolean required" }, { status: 400 });
  }

  try {
    const svc = await prisma.service.findUnique({
      where: { id },
      select: { id: true, status: true, featured: true, updatedAt: true },
    });
    if (!svc) return noStore({ error: "Not found" }, { status: 404 });

    if (!forceParsed && svc.status !== "ACTIVE") {
      return noStore(
        {
          error: "Only ACTIVE services can be toggled. Pass force:true to override.",
          status: svc.status,
        },
        { status: 409 }
      );
    }

    if (svc.featured === featuredParsed) {
      return noStore({
        ok: true,
        noChange: true,
        service: { id: svc.id, featured: svc.featured, status: svc.status },
      });
    }

    const updated = await prisma.service.update({
      where: { id },
      data: { featured: featuredParsed },
      select: { id: true, featured: true, status: true, updatedAt: true },
    });

    // Optional audit (only if model exists)
    try {
      await (prisma as any).adminAuditLog?.create?.({
        data: {
          actorId: user.id,
          action: "SERVICE_FEATURE_TOGGLE",
          meta: {
            serviceId: id,
            before: { featured: svc.featured, status: svc.status },
            after: { featured: updated.featured, status: updated.status },
            reqId,
          },
        },
      });
    } catch {
      /* ignore audit errors */
    }

    return noStore({ ok: true, service: updated });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[services/:id/feature PATCH] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* --------- minimal CORS/health helpers (optional) --------- */
export function OPTIONS() {
  const origin =
    process.env["NEXT_PUBLIC_APP_URL"] ??
    process.env["APP_ORIGIN"] ??
    "*";
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS, HEAD");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export function HEAD() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
