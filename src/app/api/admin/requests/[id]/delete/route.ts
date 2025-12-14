// src/app/api/admin/requests/[id]/delete/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function isAdminSession(session: any): boolean {
  const v = session as any;
  const role = v?.user?.role ?? v?.role ?? v?.session?.user?.role;
  const isAdminFlag = Boolean(
    v?.user?.isAdmin ?? v?.isAdmin ?? v?.session?.user?.isAdmin,
  );
  const r = String(role ?? "").toUpperCase();
  return isAdminFlag || r === "ADMIN" || r === "SUPERADMIN";
}

type RouteCtx = {
  // Next.js 15+ route handler typing expects params to be Promise-wrapped
  params: Promise<{ id: string }>;
};

/**
 * POST /api/admin/requests/[id]/delete
 * Hard-delete (consistent)
 */
export async function POST(_req: Request, ctx: RouteCtx) {
  const session = await auth();
  if (!session) return noStore({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminSession(session))
    return noStore({ error: "Forbidden" }, { status: 403 });

  try {
    // Defensive: works even if runtime ever passes a plain object.
    const params = await Promise.resolve((ctx as any)?.params);
    const id = String(params?.id ?? "").trim();
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    const requestModel = (prisma as any).request;

    if (!requestModel?.delete) {
      return noStore(
        { error: "Request model not available" },
        { status: 500 },
      );
    }

    await requestModel.delete({ where: { id } });

    return noStore({ ok: true, id });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/admin/requests/[id]/delete POST] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
