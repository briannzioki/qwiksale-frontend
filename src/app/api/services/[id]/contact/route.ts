// src/app/api/services/[id]/contact/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";

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
    const id = i >= 0 ? (segs[i + 1] ?? "") : "";
    return (id ?? "").toString().trim();
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

function validUrl(u?: string | null): string | null {
  const s = (u || "").trim();
  if (!s) return null;
  try {
    const uu = new URL(s);
    if (uu.protocol === "http:" || uu.protocol === "https:") {
      return uu.toString().slice(0, 500);
    }
  } catch {}
  return null;
}

/* ------------------------------- GET ------------------------------- */
export async function GET(req: NextRequest) {
  try {
    const listingId = getId(req);
    if (!listingId) return noStore({ error: "Missing id" }, { status: 400 });

    // viewer is optional (guests allowed)
    const session = await auth().catch(() => null);
    const viewerUserId = (session as any)?.user?.id as string | undefined;

    // Global best-effort rate limit (bucket per viewer + service)
    const rl = await checkRateLimit(req.headers, {
      name: "services_contact_reveal",
      limit: 5,
      windowMs: 60_000,
      extraKey: `${viewerUserId ?? "anon"}:${listingId}`,
    });
    if (!rl.ok) {
      return tooMany(
        "Please wait a moment before revealing more contacts.",
        rl.retryAfterSec
      );
    }

    // Minimal public fields
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

    // ---- Soft throttle windows (DB-backed) ----
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") || null;
    const now = Date.now();
    const WIN_IP_HR = new Date(now - 60 * 60 * 1000);     // 1 hour
    const WIN_DEVICE_15 = new Date(now - 15 * 60 * 1000); // 15 minutes

    const MAX_PER_IP_PER_HOUR = 12;
    const MAX_PER_DEVICE_15MIN = 6;

    // We don't know which model your schema uses; try serviceContactReveal first,
    // then contactReveal with a serviceId column. All DB calls are best-effort.
    const db: any = prisma;

    // Count recent reveals per IP for this listing
    if (ip) {
      let ipCount = 0;
      try {
        if (db.serviceContactReveal?.count) {
          ipCount = await db.serviceContactReveal.count({
            where: { serviceId: listingId, ip, createdAt: { gte: WIN_IP_HR } },
          });
        } else if (db.contactReveal?.count) {
          ipCount = await db.contactReveal.count({
            where: { serviceId: listingId, ip, createdAt: { gte: WIN_IP_HR } },
          });
        }
      } catch {
        // ignore
      }
      if (ipCount >= MAX_PER_IP_PER_HOUR) {
        const res = noStore(
          { error: "Too many requests. Please try again later." },
          { status: 429 },
        );
        res.headers.set("Retry-After", "1800"); // 30 min
        return res;
      }
    }

    // Count recent reveals per (IP + UA) for this listing
    if (ip && ua) {
      let devCount = 0;
      try {
        if (db.serviceContactReveal?.count) {
          devCount = await db.serviceContactReveal.count({
            where: { serviceId: listingId, ip, userAgent: ua, createdAt: { gte: WIN_DEVICE_15 } },
          });
        } else if (db.contactReveal?.count) {
          devCount = await db.contactReveal.count({
            where: { serviceId: listingId, ip, userAgent: ua, createdAt: { gte: WIN_DEVICE_15 } },
          });
        }
      } catch {
        // ignore
      }
      if (devCount >= MAX_PER_DEVICE_15MIN) {
        const res = noStore(
          { error: "Please wait a few minutes before trying again." },
          { status: 429 },
        );
        res.headers.set("Retry-After", "300"); // 5 min
        return res;
      }
    }

    // Light telemetry — never block user on errors
    const referer = validUrl(req.headers.get("referer"));
    void referer; // add a column later if you want

    (async () => {
      try {
        if (db.serviceContactReveal?.create) {
          await db.serviceContactReveal.create({
            data: {
              serviceId: listingId,
              viewerUserId: viewerUserId ?? null,
              ip: ip ?? null,
              userAgent: ua,
            },
          });
        } else if (db.contactReveal?.create) {
          // Fallback if your generic table has serviceId
          await db.contactReveal.create({
            data: {
              serviceId: listingId,
              viewerUserId: viewerUserId ?? null,
              ip: ip ?? null,
              userAgent: ua,
            },
          });
        }
      } catch {
        // swallow
      }
    })();

    // Shape contact payload
    const contact = {
      name: svc.sellerName || "Provider",
      phone: svc.sellerPhone || null,
      location: svc.sellerLocation || null,
    };

    return noStore({
      service: { id: svc.id, name: svc.name },
      contact,
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
    process.env["NEXT_PUBLIC_APP_ORIGIN"] ??
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
