// src/app/api/admin/products/[id]/feature/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

function isAdminEmail(email?: string | null) {
  const raw = process.env.ADMIN_EMAILS || "";
  const set = new Set(
    raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
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

export async function PATCH(req: NextRequest, ctx: CtxLike) {
  try {
    // --- authZ: admin only (by whitelist or DB role) ---
    const session = await auth();
    const user = (session as any)?.user;
    if (!user?.email) return noStore({ error: "Unauthorized" }, { status: 401 });

    let ok = isAdminEmail(user.email);
    if (!ok && user.id) {
      const db = await prisma.user.findUnique({
        where: { id: user.id },
        select: { role: true },
      });
      ok = db?.role === "ADMIN";
    }
    if (!ok) return noStore({ error: "Forbidden" }, { status: 403 });

    // --- params ---
    const id = await getId(ctx);
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    // --- body ---
    const body = (await req.json().catch(() => ({}))) as {
      featured?: unknown;
      force?: unknown; // allow non-ACTIVE when true
    };
    const featured =
      typeof body?.featured === "boolean" ? body.featured : undefined;
    const force = body?.force === true;

    if (typeof featured !== "boolean") {
      return noStore({ error: "featured:boolean required" }, { status: 400 });
    }

    // --- load product first (so we can validate status and 404 cleanly) ---
    const prod = await prisma.product.findUnique({
      where: { id },
      select: { id: true, status: true, featured: true },
    });
    if (!prod) return noStore({ error: "Not found" }, { status: 404 });

    // By default, only ACTIVE products can be featured/unfeatured
    if (!force && prod.status !== "ACTIVE") {
      return noStore(
        {
          error:
            "Only ACTIVE products can be toggled. Pass force:true to override.",
          status: prod.status,
        },
        { status: 409 }
      );
    }

    // --- update ---
    const updated = await prisma.product.update({
      where: { id },
      data: { featured },
      select: { id: true, featured: true, status: true },
    });

    return noStore(updated);
  } catch (e) {
    console.warn("[admin/products/:id/feature PATCH] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
