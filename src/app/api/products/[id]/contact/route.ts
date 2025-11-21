// src/app/api/products/[id]/contact/route.ts
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

/* ----------------------------- GET (with throttle) ----------------------------- */
export async function GET(req: NextRequest) {
  try {
    const listingId = getId(req);
    if (!listingId) return noStore({ error: "Missing id" }, { status: 400 });

    // viewer is optional (guests allowed)
    const session = await auth().catch(() => null);
    const viewerUserId = (session as any)?.user?.id as string | undefined;

    // Global best-effort rate limit (bucket per viewer + product)
    const rl =
      (await checkRateLimit(req.headers, {
        name: "products_contact_reveal",
        limit: 5,
        windowMs: 60_000,
        extraKey: `${viewerUserId ?? "anon"}:${listingId}`,
      }).catch((e: unknown) => {
        // best-effort only; never 500 just because rate-limit infra is unhappy
        // eslint-disable-next-line no-console
        console.warn("[products/:id/contact] rate-limit error:", e);
        return { ok: true, retryAfterSec: 0 };
      })) as { ok: boolean; retryAfterSec?: number };

    if (!rl.ok) {
      const retryAfterSec =
        typeof rl.retryAfterSec === "number" ? rl.retryAfterSec : 60;

      return tooMany(
        "Please wait a moment before revealing more contacts.",
        retryAfterSec,
      );
    }

    // Minimal public fields
    const product = await prisma.product.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        name: true,
        sellerName: true,
        sellerPhone: true,
        sellerLocation: true,
      },
    });
    if (!product) return noStore({ error: "Not found" }, { status: 404 });

    // Basic telemetry (do not block on errors)
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") || null;
    const referer = validUrl(req.headers.get("referer"));
    void referer;
    void ip;

    // Record the reveal (align with current Prisma schema: productId / viewerUserId / userAgent)
    prisma.contactReveal
      .create({
        data: {
          productId: listingId,
          viewerUserId: viewerUserId ?? null,
          userAgent: ua,
          // NOTE: Your current ContactReveal model (per error logs) doesn't include `ip` or `listingType`.
          // If you add those columns later, include them here.
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
