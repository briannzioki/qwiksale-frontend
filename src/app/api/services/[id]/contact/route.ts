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

/* ------------------------------- GET ------------------------------- */
export async function GET(req: NextRequest) {
  try {
    const listingId = getId(req);
    if (!listingId) return noStore({ error: "Missing id" }, { status: 400 });

    const session = await auth().catch(() => null);
    const viewerUserId = (session as any)?.user?.id as string | undefined;

    const svc = await prisma.service.findUnique({
      where: { id: listingId },
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
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") || null;

    prisma.contactReveal
      .create({
        data: {
          listingType: "service",
          listingId,
          viewerUserId: viewerUserId ?? null,
          ip: ip ?? null,
          userAgent: ua,
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

/* ----------------------------- CORS (optional) ----------------------------- */
export function OPTIONS() {
  const origin =
    process.env["NEXT_PUBLIC_APP_URL"] ??
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
