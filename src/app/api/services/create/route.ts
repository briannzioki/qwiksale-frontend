export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
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

const RATE_TYPES = new Set(["hour", "day", "fixed"]);

function s(v: unknown) {
  const t = typeof v === "string" ? v : v == null ? "" : String(v);
  const out = t.trim();
  return out.length ? out : undefined;
}
function n(v: unknown): number | null | undefined {
  if (v === "" || v == null) return null; // treat empty as "no price"
  const num = Number(v);
  return Number.isFinite(num) ? Math.max(0, Math.round(num)) : undefined;
}
function arr(v: unknown): string[] | undefined {
  if (!v) return undefined;
  if (Array.isArray(v)) return v.map(String).map((x) => x.trim()).filter(Boolean).slice(0, 12);
  if (typeof v === "string") return [v.trim()].filter(Boolean);
  return undefined;
}
function clip(str: string | undefined, max = 5000) {
  if (!str) return str;
  return str.length <= max ? str : str.slice(0, max);
}

function normalizeMsisdn(input?: string): string | undefined {
  if (!input) return undefined;
  let s = input.replace(/\D+/g, "");
  if (s.startsWith("2547") && s.length === 12) return s;
  if ((s.startsWith("07") || s.startsWith("01")) && s.length === 10) return "254" + s.slice(1);
  if (s.startsWith("254") && s.length === 12) return s;
  if (!/^254(7|1)\d{8}$/.test(s)) return undefined;
  return s;
}

/** Lenient handle to Service model to avoid TS error if Prisma model not generated/named differently */
const db: any = prisma as any;

/* ----------------------------- POST ----------------------------- */
export async function POST(req: NextRequest) {
  try {
    const session = await auth().catch(() => null);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    // Rate limit per IP + user
    const rl = checkRateLimit(req.headers, {
      name: "create_listing",
      limit: 6,                 // 6 / 10m
      windowMs: 10 * 60_000,
      extraKey: userId,
    });
    if (!rl.ok) {
      return tooMany("Too many create attempts. Try again later.", rl.retryAfterSec);
    }

    const body = await req.json().catch(() => ({}));
    const payload = {
      name: s(body.name),
      description: clip(s(body.description), 5000),
      category: s(body.category) || "Services",
      subcategory: s(body.subcategory),
      price: n(body.price), // null => contact for quote
      rateType: s(body.rateType),
      serviceArea: s(body.serviceArea),
      availability: s(body.availability),
      image: s(body.image),
      gallery: arr(body.gallery),
      sellerPhone: normalizeMsisdn(s(body.sellerPhone)),
      location: s(body.location) || s(body.serviceArea),
    };

    // validation
    if (!payload.name || payload.name.length < 3) {
      return noStore({ error: "Name is required (min 3 chars)" }, { status: 400 });
    }
    if (!payload.description || payload.description.length < 10) {
      return noStore({ error: "Description is required (min 10 chars)" }, { status: 400 });
    }
    if (payload.rateType && !RATE_TYPES.has(payload.rateType)) {
      return noStore({ error: "Invalid rateType" }, { status: 400 });
    }
    if (payload.price === undefined) {
      return noStore({ error: "Invalid price" }, { status: 400 });
    }

    // Snapshot minimal seller info from User
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, username: true, createdAt: true },
    });

    // write
    const created = await db.service.create({
      data: {
        name: payload.name,
        description: payload.description!,
        category: payload.category!,
        subcategory: payload.subcategory ?? null,
        price: payload.price, // number | null
        rateType: (payload.rateType as "hour" | "day" | "fixed") ?? "fixed",
        serviceArea: payload.serviceArea ?? null,
        availability: payload.availability ?? null,
        image: payload.image ?? null,
        gallery: payload.gallery ?? [],
        location: payload.location ?? null,
        status: "ACTIVE",
        featured: false,

        sellerId: userId,
        sellerName: me?.name ?? null,
        sellerLocation: null,
        sellerMemberSince: me?.createdAt ? me.createdAt.toISOString().slice(0, 10) : null,
        sellerRating: null,
        sellerSales: null,
        sellerPhone: payload.sellerPhone ?? null,
      },
      select: { id: true },
    });

    return noStore({ serviceId: created.id });
  } catch (e) {
    console.error("[services/create POST] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
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
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
