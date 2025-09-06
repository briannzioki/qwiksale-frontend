// src/app/api/products/[id]/contact/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function getIdFromUrl(url: string): string {
  try {
    const { pathname } = new URL(url);
    const m = pathname.match(/\/api\/products\/([^/]+)\/contact\/?$/i);
    return (m?.[1] ?? "").trim();
  } catch {
    return "";
  }
}

function getClientIp(req: Request): string | null {
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
  } catch {
    /* ignore */
  }
  return null;
}

/* ----------------------------- GET ----------------------------- */
export async function GET(req: Request) {
  try {
    const productId = getIdFromUrl(req.url);
    if (!productId) return noStore({ error: "Missing id" }, { status: 400 });

    // viewer is optional (guests allowed)
    const session = await auth().catch(() => null);
    const viewerUserId = (session as any)?.user?.id as string | undefined;

    // Minimal public fields to render the contact dialog safely
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

    // Light telemetry — never block user on errors
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") || null;
    const referer = validUrl(req.headers.get("referer")); // computed but not stored

    prisma.contactReveal
      .create({
        data: {
          productId,
          viewerUserId: viewerUserId ?? null,
          ip: ip ?? null,
          userAgent: ua,
          // referer, // <- add column first if you want to store it
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
      // nudge guests to sign in (client shows a soft banner)
      suggestLogin: !viewerUserId,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[products/:id/contact GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
