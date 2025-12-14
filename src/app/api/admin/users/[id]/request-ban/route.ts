// src/app/api/admin/users/[id]/request-ban/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

type RouteCtx = { params: Promise<{ id: string }> };

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

async function readParamId(ctx: RouteCtx): Promise<string> {
  const p: any = (ctx as any)?.params;
  const params = p && typeof p?.then === "function" ? await p : p;
  return String(params?.id ?? "").trim();
}

function isAdminSession(session: any): boolean {
  const v = session as any;
  const role = v?.user?.role ?? v?.role ?? v?.session?.user?.role;
  const isAdminFlag = Boolean(v?.user?.isAdmin ?? v?.isAdmin ?? v?.session?.user?.isAdmin);
  const r = String(role ?? "").toUpperCase();
  return isAdminFlag || r === "ADMIN" || r === "SUPERADMIN";
}

async function readBody(req: Request) {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return (await req.json().catch(() => ({}))) as any;
  }
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return {};
    const out: Record<string, any> = {};
    for (const [k, v] of fd.entries()) out[k] = v;
    return out;
  }
  return {};
}

function parseUntil(v: any): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * POST /api/admin/users/[id]/request-ban
 * Admin guard + set requestBanUntil (+ optional reason)
 * Body supports JSON or formData:
 * - action: "ban" | "unban"
 * - until: ISO string (for ban)
 * - reason: optional
 */
export async function POST(req: Request, ctx: RouteCtx) {
  const session = await auth();
  if (!session) return noStore({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminSession(session)) return noStore({ error: "Forbidden" }, { status: 403 });

  try {
    const userId = await readParamId(ctx);
    if (!userId) return noStore({ error: "Missing user id" }, { status: 400 });

    const body = await readBody(req);
    const action = String(body?.action || "ban").trim().toLowerCase();
    const reason = String(body?.reason || "").trim();

    if (action === "unban") {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          requestBanUntil: null,
          requestBanReason: null,
        } as any,
        select: {
          id: true,
          requestBanUntil: true,
          requestBanReason: true,
        } as any,
      });

      return noStore({
        ok: true,
        user: {
          id: String((updated as any)?.id || userId),
          requestBanUntil: null,
          requestBanReason: null,
        },
      });
    }

    const until = parseUntil(body?.until);
    if (!until) {
      return noStore({ error: "Missing/invalid until (ISO date)" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        requestBanUntil: until,
        requestBanReason: reason || null,
      } as any,
      select: {
        id: true,
        requestBanUntil: true,
        requestBanReason: true,
      } as any,
    });

    return noStore({
      ok: true,
      user: {
        id: String((updated as any)?.id || userId),
        requestBanUntil: (updated as any)?.requestBanUntil
          ? new Date((updated as any).requestBanUntil).toISOString()
          : until.toISOString(),
        requestBanReason: (updated as any)?.requestBanReason ?? (reason || null),
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/admin/users/[id]/request-ban POST] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
