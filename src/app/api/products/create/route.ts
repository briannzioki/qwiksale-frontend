// src/app/api/products/create/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession, authOptions } from "@/app/lib/auth";

type Tier = "FREE" | "GOLD" | "PLATINUM";

const LIMITS: Record<Tier, { listingLimit: number; canFeature: boolean }> = {
  FREE: { listingLimit: 3, canFeature: false },
  GOLD: { listingLimit: 30, canFeature: true },
  PLATINUM: { listingLimit: 999999, canFeature: true },
};

// ---------- helpers ----------
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
  if (v === null) return null; // explicit "contact for price"
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.round(v));
  return undefined; // don't set
}

function nBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  return undefined;
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

// Normalize phone to 2547XXXXXXXX
function normalizeMsisdn(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  let s = input.replace(/\D+/g, "");
  if (/^07\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^\+2547\d{8}$/.test(input)) s = input.replace(/^\+/, "");
  if (s.startsWith("254") && s.length > 12) s = s.slice(0, 12);
  return s || undefined;
}

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

async function getMe() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, subscription: true },
  });
}

// ---------- POST /api/products/create ----------
export async function POST(req: NextRequest) {
  try {
    const me = await getMe();
    if (!me) return noStore({ error: "Unauthorized" }, { status: 401 });

    // Parse body (with safety)
    const body = await req
      .json()
      .catch(() => ({} as Record<string, unknown>));

    // Required core fields
    const name = s(body.name as string, MAX.name);
    const category = s(body.category as string, MAX.category);
    const subcategory = s(body.subcategory as string, MAX.subcategory);
    const brand = s(body.brand as string, MAX.brand);
    const description = clampLen(
      (typeof body.description === "string" ? body.description.trim() : undefined),
      MAX.description
    );
    const condition = nCond(body.condition) ?? "pre-owned";
    const price = nPrice(body.price); // undefined = don't set, null = "contact for price"
    const image = s(body.image as string, MAX.imageUrl);
    const gallery = nGallery(body.gallery);
    const location = s(body.location as string, MAX.location);
    const negotiable = nBool(body.negotiable);
    const featured = nBool(body.featured) ?? false;

    // Seller fields (flattened on Product)
    const sellerPhoneRaw = normalizeMsisdn(body.sellerPhone as string);
    const sellerName = s(body.sellerName as string, 120) ?? me.name ?? undefined;
    const sellerLocation = s(body.sellerLocation as string, MAX.location) ?? location;

    // Validate presence
    if (!name) return noStore({ error: "name is required" }, { status: 400 });
    if (!category) return noStore({ error: "category is required" }, { status: 400 });
    if (!sellerPhoneRaw) {
      return noStore(
        { error: "sellerPhone is required (format 2547XXXXXXXX or 07XXXXXXXX)" },
        { status: 400 }
      );
    }
    if (!/^2547\d{8}$/.test(sellerPhoneRaw)) {
      return noStore({ error: "sellerPhone must be 2547XXXXXXXX" }, { status: 400 });
    }

    // Tier enforcement
    const tier = (me.subscription as Tier) ?? "FREE";
    const limits = LIMITS[tier];

    const myActiveCount = await prisma.product.count({ where: { sellerId: me.id } });
    if (myActiveCount >= limits.listingLimit) {
      return noStore(
        { error: `Listing limit reached for ${tier}` },
        { status: 403 }
      );
    }
    if (featured && !limits.canFeature) {
      return noStore(
        { error: `Your ${tier} tier cannot mark items as featured.` },
        { status: 403 }
      );
    }

    // Auto-derive gallery if empty but image provided
    const finalGallery = gallery ?? (image ? [image] : []);

    // Build create data
    const data: any = {
      name,
      category,
      subcategory,
      brand,
      description,
      condition,
      price, // may be null
      image,
      gallery: finalGallery,
      location,
      negotiable,
      featured,
      sellerId: me.id,
      sellerName,
      sellerPhone: sellerPhoneRaw,
      sellerLocation,
      createdAt: new Date(),
    };

    // Strip undefined keys (keep null if explicitly set)
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

    const created = await prisma.product.create({
      data,
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
        // NOTE: we intentionally do NOT echo sellerPhone back widely in APIs,
        // but returning it here (to the creator) is acceptable if you prefer.
      },
    });

    return noStore(created, { status: 201 });
  } catch (e: any) {
    console.error("POST /api/products/create error", e);
    return noStore({ error: e?.message || "Server error" }, { status: 500 });
  }
}
