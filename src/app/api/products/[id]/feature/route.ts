// src/app/api/products/[id]/feature/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

/* ---------------- tiny utils ---------------- */

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
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
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(t)) return true;
    if (["0", "false", "no", "off"].includes(t)) return false;
  }
  return undefined;
}

/* ---------------- GET /api/products/[id]/feature ---------------- */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const id = (params?.id || "").trim();
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true, name: true, status: true, featured: true, updatedAt: true },
    });

    if (!product) return noStore({ error: "Not found" }, { status: 404 });

    return noStore({ ok: true, product });
  } catch (e) {
    console.warn("[products/:id/feature GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* --------------- PATCH /api/products/[id]/feature --------------- */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  try {
    // --- authN / authZ ---
    const session = await auth();
    const user = (session as any)?.user;

    if (!user?.id || !user?.email) {
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
      return noStore({ error: "Forbidden" }, { status: 403 });
    }

    // --- params ---
    const id = (params?.id || "").trim();
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    // --- body / query ---
    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      /* allow empty/invalid JSON when using query params */
    }

    const url = new URL(req.url);
    const q = url.searchParams;

    const featuredQ = q.get("featured");
    const forceQ = q.get("force");

    const featuredBody = (body as any)?.featured as unknown;
    const forceBody = (body as any)?.force as unknown;

    const featuredParsed = parseBoolean(featuredBody ?? featuredQ);
    const forceParsed = parseBoolean(forceBody ?? forceQ) === true;

    if (typeof featuredParsed !== "boolean") {
      return noStore({ error: "featured:boolean required" }, { status: 400 });
    }

    const prod = await prisma.product.findUnique({
      where: { id },
      select: { id: true, status: true, featured: true, updatedAt: true },
    });
    if (!prod) return noStore({ error: "Not found" }, { status: 404 });

    if (!forceParsed && prod.status !== "ACTIVE") {
      return noStore(
        {
          error: "Only ACTIVE products can be toggled. Pass force:true to override.",
          status: prod.status,
        },
        { status: 409 }
      );
    }

    if (prod.featured === featuredParsed) {
      return noStore({
        ok: true,
        noChange: true,
        product: { id: prod.id, featured: prod.featured, status: prod.status },
      });
    }

    const updated = await prisma.product.update({
      where: { id },
      data: { featured: featuredParsed },
      select: { id: true, featured: true, status: true, updatedAt: true },
    });

    try {
      // @ts-expect-error - only if you have this model
      await prisma.adminAuditLog?.create({
        data: {
          actorId: user.id,
          action: "PRODUCT_FEATURE_TOGGLE",
          meta: {
            productId: id,
            before: { featured: prod.featured, status: prod.status },
            after: { featured: updated.featured, status: updated.status },
            reqId,
          },
        },
      });
    } catch {}

    return noStore({ ok: true, product: updated });
  } catch (e) {
    console.warn("[products/:id/feature PATCH] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* --------- minimal CORS/health helpers (optional) --------- */
export async function OPTIONS() {
  return noStore({ ok: true }, { status: 204 });
}
export async function HEAD() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
