// src/app/api/products/create/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

type Tier = "BASIC" | "GOLD" | "PLATINUM";

const LIMITS: Record<Tier, { listingLimit: number; canFeature: boolean }> = {
  BASIC: { listingLimit: 3, canFeature: false }, // BASIC maps to DB "FREE"
  GOLD: { listingLimit: 30, canFeature: true },
  PLATINUM: { listingLimit: 999_999, canFeature: true },
};

/* ---------------- helpers ---------------- */

const MAX = {
  name: 140,
  category: 64,
  subcategory: 64,
  brand: 64,
  location: 120,
  description: 5000,
  imageUrl: 2048,
  galleryCount: 20,
} as const;

function clampLen(s: string | undefined, max: number) {
  if (!s) return s;
  return s.length > max ? s.slice(0, max) : s;
}

function s(v: unknown, max?: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return undefined;
  return typeof max === "number" ? clampLen(t, max) : t;
}

function nPrice(v: unknown): number | null | undefined {
  if (v === null) return null; // explicit “contact for price”
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.round(v));
  return undefined;
}

function nBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function nCond(v: unknown): "brand new" | "pre-owned" | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().toLowerCase();
  if (["brand new", "brand-new", "brand_new"].includes(t)) return "brand new";
  if (["pre-owned", "pre owned", "pre_owned", "used"].includes(t)) return "pre-owned";
  return undefined;
}

function nGallery(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const cleaned = v
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0)
    .map((x) => clampLen(x, MAX.imageUrl)!);
  const unique = Array.from(new Set(cleaned)).slice(0, MAX.galleryCount);
  return unique;
}

/** Normalize Kenyan MSISDN to `2547XXXXXXXX` or `2541XXXXXXXX`. */
function normalizeMsisdn(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  let raw = input.trim();

  // Already +2547… or +2541…
  if (/^\+254(7|1)\d{8}$/.test(raw)) raw = raw.replace(/^\+/, "");

  // Strip non-digits
  let s = raw.replace(/\D+/g, "");

  // 07… / 01… -> 2547… / 2541…
  if (/^07\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^01\d{8}$/.test(s)) s = "254" + s.slice(1);

  // 7…… or 1…… -> 2547… / 2541…
  if (/^7\d{8}$/.test(s)) s = "254" + s;
  if (/^1\d{8}$/.test(s)) s = "254" + s;

  // Truncate any accidental extra digits
  if (s.startsWith("254") && s.length > 12) s = s.slice(0, 12);

  return s || undefined;
}

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

async function getMe() {
  const session = await auth();
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, subscription: true },
  });
}

function toTier(sub?: string | null): Tier {
  const s = (sub || "").toUpperCase();
  if (s === "GOLD") return "GOLD";
  if (s === "PLATINUM") return "PLATINUM";
  return "BASIC"; // Treat FREE/NULL/UNKNOWN as BASIC
}

/* --------------- POST /api/products/create --------------- */
export async function POST(req: NextRequest) {
  try {
    const me = await getMe();
    if (!me) return noStore({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Required basics
    const name = s(body.name, MAX.name);
    const category = s(body.category, MAX.category);
    const subcategory = s(body.subcategory, MAX.subcategory);

    // Optional
    const brand = s(body.brand, MAX.brand);
    const description = clampLen(
      typeof body.description === "string" ? body.description.trim() : undefined,
      MAX.description
    );
    const condition = nCond(body.condition) ?? "pre-owned";
    const price = nPrice(body.price); // null => contact for price
    const image = s(body.image, MAX.imageUrl);
    const gallery = nGallery(body.gallery);
    const location = s(body.location, MAX.location);
    const negotiable = nBool(body.negotiable);
    let featured = nBool(body.featured) ?? false;

    // Seller snapshot (phone is OPTIONAL)
    const sellerPhoneRaw = normalizeMsisdn(body.sellerPhone);
    if (typeof body.sellerPhone === "string" && !sellerPhoneRaw) {
      return noStore(
        { error: "Invalid sellerPhone. Use 07/01, +2547/+2541, or 2547/2541." },
        { status: 400 }
      );
    }
    if (sellerPhoneRaw && !/^254(7|1)\d{8}$/.test(sellerPhoneRaw)) {
      return noStore(
        { error: "sellerPhone must be 2547XXXXXXXX or 2541XXXXXXXX" },
        { status: 400 }
      );
    }

    const sellerName = s(body.sellerName, 120) ?? me.name ?? undefined;
    const sellerLocation = s(body.sellerLocation, MAX.location) ?? location;

    // Validate required
    if (!name) return noStore({ error: "name is required" }, { status: 400 });
    if (!category) return noStore({ error: "category is required" }, { status: 400 });
    if (!subcategory) return noStore({ error: "subcategory is required" }, { status: 400 });

    // Tier enforcement
    const tier = toTier(me.subscription);
    const limits = LIMITS[tier];

    // Count only ACTIVE listings for limits
    const myActiveCount = await prisma.product.count({
      where: { sellerId: me.id, status: "ACTIVE" },
    });
    if (myActiveCount >= limits.listingLimit) {
      return noStore({ error: `Listing limit reached for ${tier}` }, { status: 403 });
    }

    // Enforce featured permission
    if (!limits.canFeature && featured) featured = false;

    // Auto gallery fallback
    const finalGallery = gallery ?? (image ? [image] : []);

    // Create
    const created = await prisma.product.create({
      data: {
        name,
        category,
        subcategory,
        condition,
        featured,
        sellerId: me.id,
        // status defaults to ACTIVE in schema
        createdAt: new Date(),

        ...(brand ? { brand } : {}),
        ...(description ? { description } : {}),
        ...(price !== undefined ? { price } : {}), // allow null for "contact for price"
        ...(image ? { image } : {}),
        ...(finalGallery.length ? { gallery: finalGallery } : {}),
        ...(location ? { location } : {}),
        ...(negotiable !== undefined ? { negotiable } : {}),
        ...(sellerName ? { sellerName } : {}),
        sellerPhone: sellerPhoneRaw ?? null, // store null if not provided
        ...(sellerLocation ? { sellerLocation } : {}),
      },
      select: {
        id: true,
        name: true,
        category: true,
        subcategory: true,
        brand: true,
        condition: true,
        price: true,
        image: true,
        gallery: true,
        location: true,
        negotiable: true,
        featured: true,
        createdAt: true,
        sellerId: true,
        sellerName: true,
        sellerLocation: true,
      },
    });

    return noStore(created, { status: 201 });
  } catch (e: any) {
    console.error("POST /api/products/create error", e);
    return noStore({ error: e?.message || "Server error" }, { status: 500 });
  }
}
