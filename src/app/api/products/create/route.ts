// src/app/api/products/create/route.ts
export const preferredRegion = "fra1";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";
import { revalidatePath, revalidateTag } from "next/cache";
import { createHash } from "crypto";

/* ----------------------------- tiny utils ----------------------------- */

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  // avoid cache mixups across sessions/proxies
  res.headers.set("Vary", "Authorization, Cookie");
  return res;
}

function clampLen(s: string | undefined, max: number) {
  if (!s) return s;
  return s.length > max ? s.slice(0, max) : s;
}

const STRIP_HTML_RE = /<[^>]*>/g;
const CTRL_RE = /[\u0000-\u0008\u000B-\u001F\u007F]+/g;

function sanitizeInline(text: unknown, max?: number): string | undefined {
  if (typeof text !== "string") return undefined;
  let t = text.replace(STRIP_HTML_RE, "").replace(CTRL_RE, "").trim();
  t = t.replace(/\s+/g, " ");
  if (!t) return undefined;
  return typeof max === "number" ? clampLen(t, max) : t;
}

function sanitizeMultiline(text: unknown, max: number): string | undefined {
  if (typeof text !== "string") return undefined;
  let t = text.replace(STRIP_HTML_RE, "").replace(CTRL_RE, "").trim();
  // collapse >2 consecutive newlines
  t = t.replace(/\n{3,}/g, "\n\n");
  if (!t) return undefined;
  return clampLen(t, max);
}

function s(v: unknown, max?: number): string | undefined {
  return sanitizeInline(v, max);
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

const ALLOWED_IMAGE_HOSTS = [
  "res.cloudinary.com",
  "images.unsplash.com",
] as const;

function isAllowedUrl(u: string): boolean {
  try {
    const { protocol, hostname } = new URL(u);
    if (!/^https?:$/i.test(protocol)) return false;
    return ALLOWED_IMAGE_HOSTS.some((h) => hostname.endsWith(h));
  } catch {
    return false;
  }
}

function nGallery(v: unknown, maxUrl: number, maxCount: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const cleaned = v
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .map((x) => clampLen(x, maxUrl)!)
    .filter((x) => /^https?:\/\//i.test(x) && isAllowedUrl(x));
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
  const session = await auth().catch(() => null);
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
      const r = noStore({ error: "Unauthorized" }, { status: 401 });
      r.headers.set("x-request-id", reqId);
      return r;
    }

    // Rate limit per IP + user
    const rl = await checkRateLimit(req.headers, {
      name: "products_create",
      limit: 6,
      windowMs: 10 * 60_000,
      extraKey: me.id,
    });
    if (!rl.ok) {
      const r = tooMany("Too many create attempts. Try again later.", rl.retryAfterSec);
      r.headers.set("x-request-id", reqId);
      return r;
    }

    // Reject non-JSON early
    const ctype = req.headers.get("content-type") || "";
    if (!ctype.toLowerCase().includes("application/json")) {
      const r = noStore({ error: "Content-Type must be application/json" }, { status: 415 });
      r.headers.set("x-request-id", reqId);
      return r;
    }

    track("product_create_attempt", { reqId, userId: me.id, tier: toTier(me.subscription) });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Required basics
    const name = s(body["name"], MAX.name);
    const category = s(body["category"], MAX.category);
    const subcategory = s(body["subcategory"], MAX.subcategory);

    // Optional
    const brand = s(body["brand"], MAX.brand);
    const description = sanitizeMultiline(body["description"], MAX.description);
    const condition = nCond(body["condition"]) ?? "pre-owned";
    const price = nPrice(body["price"]); // null => contact for price

    // Image + gallery (allowlist hosts)
    const rawImage = s(body["image"], MAX.imageUrl);
    const image = rawImage && isAllowedUrl(rawImage) ? rawImage : undefined;

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
      const r = noStore(
        { error: "Invalid sellerPhone. Use 07/01, +2547/+2541, or 2547/2541." },
        { status: 400 }
      );
      r.headers.set("x-request-id", reqId);
      return r;
    }

    const sellerName = s(body["sellerName"], 120) ?? me.name ?? undefined;
    const sellerLocation =
      s(body["sellerLocation"], MAX.location) ??
      (me.city ? [me.city, me.country].filter(Boolean).join(", ") : me.country ?? undefined) ??
      location;

    // Validate required
    if (!name) {
      track("product_create_validation_error", { reqId, userId: me.id, field: "name" });
      const r = noStore({ error: "name is required" }, { status: 400 });
      r.headers.set("x-request-id", reqId);
      return r;
    }
    if (!category) {
      track("product_create_validation_error", { reqId, userId: me.id, field: "category" });
      const r = noStore({ error: "category is required" }, { status: 400 });
      r.headers.set("x-request-id", reqId);
      return r;
    }
    if (!subcategory) {
      track("product_create_validation_error", { reqId, userId: me.id, field: "subcategory" });
      const r = noStore({ error: "subcategory is required" }, { status: 400 });
      r.headers.set("x-request-id", reqId);
      return r;
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
      const r = noStore({ error: `Listing limit reached for ${tier}` }, { status: 403 });
      r.headers.set("x-request-id", reqId);
      return r;
    }

    // Enforce featured permission
    if (!limits.canFeature && featured) featured = false;

    // Final gallery with allowlist & dedup (& include image if not already)
    const galleryAllowed = (gallery ?? []).filter(isAllowedUrl);
    const finalGallery = Array.from(
      new Set([...(image ? [image] : []), ...galleryAllowed])
    );

    // Duplicate-post guard (same user, recent, same key fields)
    const dedupeKey = createHash("sha256")
      .update(
        [
          name.toLowerCase(),
          category.toLowerCase(),
          subcategory.toLowerCase(),
          String(price ?? ""),
          (brand || "").toLowerCase(),
          condition,
        ].join("|")
      )
      .digest("hex");

    const recentDuplicate = await prisma.product.findFirst({
      where: {
        sellerId: me.id,
        status: "ACTIVE",
        createdAt: { gt: new Date(Date.now() - 5 * 60_000) }, // last 5 minutes
        name,
        category,
        subcategory,
        ...(brand ? { brand } : {}),
        ...(price !== undefined ? { price } : {}),
      },
      select: { id: true },
    });

    if (recentDuplicate) {
      const r = noStore(
        { error: "Looks like you already posted this recently.", productId: recentDuplicate.id },
        { status: 409 }
      );
      r.headers.set("x-request-id", reqId);
      return r;
    }

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
        dedupeKey, // if your schema has it; otherwise remove this line

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

    // invalidate caches so the listing appears immediately
    try {
      revalidateTag("home:active");
      revalidateTag("products:latest");
      revalidateTag(`user:${me.id}:listings`);
      revalidatePath("/");
    } catch {
      /* best-effort */
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

    const r = noStore({ ok: true, productId: created.id }, { status: 201 });
    r.headers.set("x-request-id", reqId);
    return r;
  } catch (e: any) {
    console.error("POST /api/products/create error", e);
    track("product_create_error", { reqId, message: e?.message ?? String(e) });

    if (e?.code === "P2002") {
      const r = noStore({ error: "Duplicate value not allowed" }, { status: 409 });
      r.headers.set("x-request-id", reqId);
      return r;
    }

    const r = noStore({ error: e?.message || "Server error" }, { status: 500 });
    r.headers.set("x-request-id", reqId);
    return r;
  }
}
