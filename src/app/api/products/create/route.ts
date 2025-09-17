// src/app/api/products/create/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";
import { revalidatePath, revalidateTag } from "next/cache"; // ← ADD

/* ----------------------------- tiny utils ----------------------------- */

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

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
  if (typeof v === "number" && Number.isFinite(v)) {
    const n = Math.round(v);
    if (n < 0) return 0;
    if (n > 9_999_999) return 9_999_999;
    return n;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return nPrice(n);
  }
  return undefined;
}
function nBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (["1", "true", "yes"].includes(t)) return true;
    if (["0", "false", "no"].includes(t)) return false;
  }
  return undefined;
}
function nCond(v: unknown): "brand new" | "pre-owned" | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().toLowerCase();
  if (["brand new", "brand-new", "brand_new", "new"].includes(t)) return "brand new";
  if (["pre-owned", "pre owned", "pre_owned", "used"].includes(t)) return "pre-owned";
  return undefined;
}
function nGallery(v: unknown, maxUrl: number, maxCount: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const cleaned = v
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .map((x) => clampLen(x, maxUrl)!)
    .filter((x) => /^https?:\/\//i.test(x));
  const unique = Array.from(new Set(cleaned)).slice(0, maxCount);
  return unique;
}
/** Normalize Kenyan MSISDN to `2547XXXXXXXX` or `2541XXXXXXXX`. */
function normalizeMsisdn(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  let raw = input.trim();

  if (/^\+254(7|1)\d{8}$/.test(raw)) raw = raw.replace(/^\+/, "");
  let s = raw.replace(/\D+/g, "");
  if (/^07\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^01\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^7\d{8}$/.test(s)) s = "254" + s;
  if (/^1\d{8}$/.test(s)) s = "254" + s;
  if (s.startsWith("254") && s.length > 12) s = s.slice(0, 12);

  return /^254(7|1)\d{8}$/.test(s) ? s : undefined;
}

/* ----------------------------- instrumentation ----------------------------- */

type AnalyticsEvent =
  | "product_create_attempt"
  | "product_create_validation_error"
  | "product_create_limit_reached"
  | "product_create_success"
  | "product_create_error";

function track(event: AnalyticsEvent, props?: Record<string, unknown>) {
  try {
    console.log(`[track] ${event}`, { ts: new Date().toISOString(), ...props });
  } catch {}
}

/* --------------------------------- policy --------------------------------- */

type Tier = "BASIC" | "GOLD" | "PLATINUM";
const LIMITS: Record<Tier, { listingLimit: number; canFeature: boolean }> = {
  BASIC: { listingLimit: 3, canFeature: false },
  GOLD: { listingLimit: 30, canFeature: true },
  PLATINUM: { listingLimit: 999_999, canFeature: true },
};

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

function toTier(sub?: string | null): Tier {
  const s = (sub || "").toUpperCase();
  if (s === "GOLD") return "GOLD";
  if (s === "PLATINUM") return "PLATINUM";
  return "BASIC";
}

async function getMe() {
  const session = await auth();
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      subscription: true,
      whatsapp: true,
      city: true,
      country: true,
    },
  });
}

/* ---------------------------------- CORS ---------------------------------- */
export function OPTIONS() {
  const res = new NextResponse(null, { status: 204 });
  res.headers.set(
    "Access-Control-Allow-Origin",
    process.env["NEXT_PUBLIC_APP_URL"] || "*"
  );
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/* --------------- POST /api/products/create (main) --------------- */

export async function POST(req: NextRequest) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);

  try {
    const me = await getMe();
    if (!me) {
      track("product_create_validation_error", { reqId, reason: "unauthorized" });
      return noStore({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit per IP + user
    const rl = await checkRateLimit(req.headers, {
      name: "products_create",
      limit: 6,
      windowMs: 10 * 60_000,
      extraKey: me.id, // <-- use authenticated user id
    });
    if (!rl.ok) {
      return tooMany("Too many create attempts. Try again later.", rl.retryAfterSec);
    }

    // Reject non-JSON early
    const ctype = req.headers.get("content-type") || "";
    if (!ctype.toLowerCase().includes("application/json")) {
      return noStore({ error: "Content-Type must be application/json" }, { status: 415 });
    }

    track("product_create_attempt", { reqId, userId: me.id, tier: toTier(me.subscription) });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Required basics
    const name = s(body["name"], MAX.name);
    const category = s(body["category"], MAX.category);
    const subcategory = s(body["subcategory"], MAX.subcategory);

    // Optional
    const brand = s(body["brand"], MAX.brand);
    const description = clampLen(
      typeof body["description"] === "string" ? body["description"].trim() : undefined,
      MAX.description
    );
    const condition = nCond(body["condition"]) ?? "pre-owned";
    const price = nPrice(body["price"]); // null => contact for price
    const image = s(body["image"], MAX.imageUrl);
    const gallery = nGallery(body["gallery"], MAX.imageUrl, MAX.galleryCount);
    const location = s(body["location"], MAX.location);
    const negotiable = nBool(body["negotiable"]);
    let featured = nBool(body["featured"]) ?? false;

    // Seller snapshot (phone is OPTIONAL)
    let sellerPhoneRaw = normalizeMsisdn(body["sellerPhone"]);
    if (!sellerPhoneRaw && me.whatsapp) {
      sellerPhoneRaw = normalizeMsisdn(me.whatsapp) ?? undefined;
    }
    if (typeof body["sellerPhone"] === "string" && !normalizeMsisdn(body["sellerPhone"])) {
      track("product_create_validation_error", {
        reqId,
        userId: me.id,
        field: "sellerPhone",
        reason: "invalid_format",
      });
      return noStore(
        { error: "Invalid sellerPhone. Use 07/01, +2547/+2541, or 2547/2541." },
        { status: 400 }
      );
    }

    const sellerName = s(body["sellerName"], 120) ?? me.name ?? undefined;
    const sellerLocation =
      s(body["sellerLocation"], MAX.location) ??
      (me.city ? [me.city, me.country].filter(Boolean).join(", ") : me.country ?? undefined) ??
      location;

    // Validate required
    if (!name) {
      track("product_create_validation_error", { reqId, userId: me.id, field: "name" });
      return noStore({ error: "name is required" }, { status: 400 });
    }
    if (!category) {
      track("product_create_validation_error", { reqId, userId: me.id, field: "category" });
      return noStore({ error: "category is required" }, { status: 400 });
    }
    if (!subcategory) {
      track("product_create_validation_error", { reqId, userId: me.id, field: "subcategory" });
      return noStore({ error: "subcategory is required" }, { status: 400 });
    }

    // Tier enforcement (count only ACTIVE listings)
    const tier = toTier(me.subscription);
    const limits = LIMITS[tier];
    const myActiveCount = await prisma.product.count({
      where: { sellerId: me.id, status: "ACTIVE" },
    });
    if (myActiveCount >= limits.listingLimit) {
      track("product_create_limit_reached", {
        reqId,
        userId: me.id,
        tier,
        limit: limits.listingLimit,
      });
      return noStore({ error: `Listing limit reached for ${tier}` }, { status: 403 });
    }

    // Enforce featured permission
    if (!limits.canFeature && featured) featured = false;

    const finalGallery = gallery ?? (image ? [image] : []);

    const created = await prisma.product.create({
      data: {
        name,
        category,
        subcategory,
        condition,
        featured,
        sellerId: me.id,
        status: "ACTIVE",
        createdAt: new Date(),

        ...(brand ? { brand } : {}),
        ...(description ? { description } : {}),
        ...(price !== undefined ? { price } : {}), // allow null for "contact for price"
        ...(image ? { image } : {}),
        ...(finalGallery.length ? { gallery: finalGallery } : {}),
        ...(location ? { location } : {}),
        ...(negotiable !== undefined ? { negotiable } : {}),
        ...(sellerName ? { sellerName } : {}),
        sellerPhone: sellerPhoneRaw ?? null,
        ...(sellerLocation ? { sellerLocation } : {}),
      },
      select: { id: true },
    });

    // ----- NEW: revalidate feed/search caches so listing appears immediately -----
    try {
      // Adjust these to match your fetch tags in Home/Search
      revalidateTag("home:active");
      revalidateTag("products:latest");
      revalidateTag(`user:${me.id}:listings`);
      // Also nuke the homepage path for good measure (cheap in Next 15)
      revalidatePath("/");
    } catch {
      /* best-effort; ignore */
    }

    track("product_create_success", {
      reqId,
      userId: me.id,
      tier,
      productId: created.id,
      featured,
      hasPrice: price != null,
      gallerySize: finalGallery.length,
    });

    return noStore({ ok: true, productId: created.id }, { status: 201 });
  } catch (e: any) {
    console.error("POST /api/products/create error", e);
    track("product_create_error", { reqId, message: e?.message ?? String(e) });

    if (e?.code === "P2002") {
      return noStore({ error: "Duplicate value not allowed" }, { status: 409 });
    }

    return noStore({ error: e?.message || "Server error" }, { status: 500 });
  }
}
