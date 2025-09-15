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
    const i = segs.findIndex((s) => s === "products");
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

/* ----------------------------- GET (with throttle) ----------------------------- */
export async function GET(req: NextRequest) {
  try {
    const productId = getId(req);
    if (!productId) return noStore({ error: "Missing id" }, { status: 400 });

    // Global best-effort rate limit (IP bucket)
    const rl = checkRateLimit(req.headers, {
      name: "products_contact",
      limit: 10,       // 10 / 30s / IP
      windowMs: 30_000,
      extraKey: productId, // scope per product to be nicer to users
    });
    if (!rl.ok) {
      return tooMany("Please wait a moment before revealing more contacts.", rl.retryAfterSec);
    }

    // viewer is optional (guests allowed)
    const session = await auth().catch(() => null);
    const viewerUserId = (session as any)?.user?.id as string | undefined;

    // Minimal public fields
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        sellerName: true,
        sellerPhone: true,
        sellerLocation: true,
      },
    });
    if (!product) return noStore({ error: "Not found" }, { status: 404 });

    // ---- Soft throttle windows (DB-backed) ----
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") || null;

    // Window sizes & limits
    const now = Date.now();
    const WIN_IP_HR = new Date(now - 60 * 60 * 1000);     // 1 hour
    const WIN_DEVICE_15 = new Date(now - 15 * 60 * 1000); // 15 minutes

    const MAX_PER_IP_PER_HOUR = 12;       // generous per IP
    const MAX_PER_DEVICE_15MIN = 6;       // same IP + UA ≈ device

    // Count recent reveals per IP for this product
    if (ip) {
      const ipCount = await prisma.contactReveal.count({
        where: {
          productId,
          ip,
          createdAt: { gte: WIN_IP_HR },
        },
      });
      if (ipCount >= MAX_PER_IP_PER_HOUR) {
        const res = noStore(
          { error: "Too many requests. Please try again later." },
          { status: 429 },
        );
        res.headers.set("Retry-After", "1800"); // 30 min
        return res;
      }
    }

    // Count recent reveals per (IP + UA) for this product
    if (ip && ua) {
      const devCount = await prisma.contactReveal.count({
        where: {
          productId,
          ip,
          userAgent: ua,
          createdAt: { gte: WIN_DEVICE_15 },
        },
      });
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
    prisma.contactReveal
      .create({
        data: {
          productId,
          viewerUserId: viewerUserId ?? null,
          ip: ip ?? null,
          userAgent: ua,
          // referer, // add column in schema if desired
        },
      })
      .catch(() => void 0);

    // Shape contact payload
    const contact = {
      name: product.sellerName || "Seller",
      phone: product.sellerPhone || null,
      location: product.sellerLocation || null,
    };

    return noStore({
      product: { id: product.id, name: product.name },
      contact,
      suggestLogin: !viewerUserId,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[products/:id/contact GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
