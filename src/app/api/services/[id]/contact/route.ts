// src/app/api/services/[id]/contact/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

/* ------------------------- tiny helpers ------------------------- */
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function getId(req: NextRequest): string {
  try {
    const segs = req.nextUrl.pathname.split("/");
    const i = segs.findIndex((s) => s === "services");
    const next = i >= 0 ? segs[i + 1] : "";
    return String(next ?? "").trim();
  } catch {
    return "";
  }
}

function getClientIp(req: NextRequest): string | null {
  const xf =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-vercel-forwarded-for") ||
    "";
  if (xf) return xf.split(",")[0]?.trim() || null;
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return null;
}

/* Use a permissive alias so this route compiles even before you generate Prisma types for `Service`. */
const db: any = prisma;

/* ----------------------------- CORS (optional) ----------------------------- */
export function OPTIONS() {
  const origin =
    process.env["NEXT_PUBLIC_SITE_URL"] ??
    process.env["NEXT_PUBLIC_APP_URL"] ??
    "*";

  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/* ------------------------------- GET ------------------------------- */
export async function GET(req: NextRequest) {
  try {
    const id = getId(req);
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    const session = await auth().catch(() => null);
    const viewerUserId = (session as any)?.user?.id as string | undefined;

    const svc = await db.service.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        sellerName: true,
        sellerPhone: true,
        sellerLocation: true,
      },
    });
    if (!svc) return noStore({ error: "Not found" }, { status: 404 });

    // telemetry (non-blocking)
    db.contactReveal
      .create({
        data: {
          productId: id, // reuse same table if desired; or add a dedicated serviceId column in your schema
          viewerUserId: viewerUserId ?? null,
          ip: getClientIp(req),
          userAgent: req.headers.get("user-agent") || null,
        },
      })
      .catch(() => {});

    return noStore({
      service: { id: svc.id, name: svc.name },
      contact: {
        name: svc.sellerName || "Provider",
        phone: svc.sellerPhone || null,
        location: svc.sellerLocation || null,
      },
      suggestLogin: !viewerUserId,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[services/:id/contact GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
