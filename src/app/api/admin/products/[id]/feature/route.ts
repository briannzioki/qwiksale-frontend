export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  return email && set.has(email.toLowerCase());
}

type CtxLike = { params?: { id: string } | Promise<{ id: string }> } | unknown;
async function getId(ctx: CtxLike): Promise<string> {
  const p: any = (ctx as any)?.params;
  const v = p && typeof p.then === "function" ? await p : p;
  return String(v?.id ?? "").trim();
}

export async function PATCH(req: NextRequest, ctx: CtxLike) {
  try {
    const session = await auth();
    const user = (session as any)?.user;
    if (!user?.email) return noStore({ error: "Unauthorized" }, { status: 401 });

    // Allow if email is whitelisted OR DB role is ADMIN
    let ok = isAdminEmail(user.email);
    if (!ok && user.id) {
      const db = await prisma.user.findUnique({
        where: { id: user.id },
        select: { role: true },
      });
      ok = db?.role === "ADMIN";
    }
    if (!ok) return noStore({ error: "Forbidden" }, { status: 403 });

    const id = await getId(ctx);
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));
    const featured =
      typeof body?.featured === "boolean" ? body.featured : undefined;
    if (typeof featured !== "boolean") {
      return noStore({ error: "featured:boolean required" }, { status: 400 });
    }

    const updated = await prisma.product.update({
      where: { id },
      data: { featured },
      select: { id: true, featured: true },
    });

    return noStore(updated);
  } catch (e) {
    console.warn("[admin/products/:id/feature PATCH] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
