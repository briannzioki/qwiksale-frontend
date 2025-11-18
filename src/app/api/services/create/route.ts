// src/app/api/services/create/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";
import { revalidatePath, revalidateTag } from "next/cache";
import { getIdempotencyKey, withIdempotency } from "@/app/lib/idempotency";

/* ------------------------- tiny helpers ------------------------- */
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
  return res;
}
function withReqId(res: NextResponse, id: string, idemKey?: string | null) {
  res.headers.set("x-request-id", id);
  if (idemKey) res.headers.set("x-idempotency-key", idemKey);
  return res;
}
const RATE_TYPES = new Set(["hour", "day", "fixed"]);

function clampLen(s: string | undefined, max: number) {
  if (!s) return s;
  return s.length > max ? s.slice(0, max) : s;
}
function s(v: unknown, max?: number): string | undefined {
  if (typeof v !== "string") v = v == null ? "" : String(v);
  const t = (v as string).replace(/[\u0000-\u0008\u000B-\u001F\u007F]+/g, "").trim();
  if (!t) return undefined;
  return typeof max === "number" ? clampLen(t, max) : t;
}
function nPrice(v: unknown): number | null | undefined {
  if (v === null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.max(0, Math.round(v));
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return nPrice(n);
    return undefined;
  }
  return undefined;
}
function nRateType(v: unknown): "hour" | "day" | "fixed" | undefined {
  const rt = s(v)?.toLowerCase();
  if (!rt) return undefined;
  return RATE_TYPES.has(rt) ? (rt as any) : undefined;
}
function nGallery(v: unknown, maxUrl: number, maxCount: number): string[] | undefined {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  if (!arr.length) return undefined;
  const cleaned = arr
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .map((x) => clampLen(x, maxUrl)!)
    .filter((x) => /^https?:\/\//i.test(x));
  return Array.from(new Set(cleaned)).slice(0, maxCount);
}
function clip(str: string | undefined, max = 5000) {
  if (!str) return str;
  return str.length <= max ? str : str.slice(0, max);
}
/** Normalize Kenyan MSISDN to `2547XXXXXXXX` / `2541XXXXXXXX`. */
function normalizeMsisdn(input?: string): string | undefined {
  if (!input) return undefined;
  let raw = input.trim();
  if (/^\+254(7|1)\d{8}$/.test(raw)) raw = raw.replace(/^\+/, "");
  let s = raw.replace(/\D+/g, "");
  if (/^07\d{8}$/.test(s) || /^01\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^7\d{8}$/.test(s) || /^1\d{8}$/.test(s)) s = "254" + s;
  if (s.startsWith("254") && s.length > 12) s = s.slice(0, 12);
  return /^254(7|1)\d{8}$/.test(s) ? s : undefined;
}

/* ------------------------------ limits ------------------------------ */
type Tier = "BASIC" | "GOLD" | "PLATINUM";
const LIMITS: Record<Tier, { listingLimit: number; canFeature: boolean }> = {
  BASIC: { listingLimit: 3, canFeature: false },
  GOLD: { listingLimit: 30, canFeature: true },
  PLATINUM: { listingLimit: 999_999, canFeature: true },
};
function toTier(sub?: string | null): Tier {
  const s = (sub || "").toUpperCase();
  if (s === "GOLD") return "GOLD";
  if (s === "PLATINUM") return "PLATINUM";
  return "BASIC";
}

const MAX = {
  name: 140,
  category: 64,
  subcategory: 64,
  location: 120,
  serviceArea: 160,
  availability: 160,
  description: 5000,
  imageUrl: 2048,
  galleryCount: 6,
} as const;

/* ----------------------------- analytics ----------------------------- */
type AnalyticsEvent =
  | "service_create_attempt"
  | "service_create_validation_error"
  | "service_create_limit_reached"
  | "service_create_success"
  | "service_create_error";
function track(ev: AnalyticsEvent, props?: Record<string, unknown>) {
  try {
    console.log(`[track] ${ev}`, { ts: new Date().toISOString(), ...props });
  } catch {}
}

/** Lenient alias so this compiles even if model is evolving. */
const db: any = prisma as any;

/* ------------- robust create (drops unknown `publishedAt`) ------------- */
async function createServiceSafe(data: any) {
  try {
    return await db.service.create({ data, select: { id: true } });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (
      msg.includes("Unknown arg `publishedAt`") ||
      msg.includes("Unknown argument") ||
      msg.includes("Argument `publishedAt`")
    ) {
      const { publishedAt, ...without } = data ?? {};
      return await db.service.create({ data: without, select: { id: true } });
    }
    throw e;
  }
}

/* -------------------- allowlist (match products/create) -------------------- */
const ALLOWED_IMAGE_HOSTS = ["res.cloudinary.com", "images.unsplash.com"] as const;

function isAllowedHost(hostname: string): boolean {
  return ALLOWED_IMAGE_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
}
function isAllowedUrl(u: string): boolean {
  try {
    const { protocol, hostname } = new URL(u);
    if (protocol !== "https:" && protocol !== "http:") return false;
    return isAllowedHost(hostname);
  } catch {
    return false;
  }
}

/* ----------------------------- POST ----------------------------- */
export async function POST(req: NextRequest) {
  const reqId = (globalThis as any).crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  const idemKey = await getIdempotencyKey(req);

  return withIdempotency(idemKey, async () => {
    try {
      const session = await auth().catch(() => null);
      const userId = (session?.user as any)?.id as string | undefined;
      if (!userId) {
        return withReqId(noStore({ error: "Unauthorized" }, { status: 401 }), reqId, idemKey);
      }

      const rl = await checkRateLimit(req.headers, {
        name: "services_create",
        limit: 6,
        windowMs: 10 * 60_000,
        extraKey: userId,
      });
      if (!rl.ok) {
        return withReqId(tooMany("Too many create attempts. Try again later.", rl.retryAfterSec), reqId, idemKey);
      }

      const ctype = req.headers.get("content-type") || "";
      if (!ctype.toLowerCase().includes("application/json")) {
        return withReqId(noStore({ error: "Content-Type must be application/json" }, { status: 415 }), reqId, idemKey);
      }

      const me = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          username: true,
          createdAt: true,
          subscription: true,
          whatsapp: true,
          city: true,
          country: true,
        },
      });
      if (!me) {
        return withReqId(noStore({ error: "Unauthorized" }, { status: 401 }), reqId, idemKey);
      }

      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

      track("service_create_attempt", { reqId, userId: me.id, tier: toTier(me.subscription) });

      const name = s(body["name"], MAX.name) ?? s(body["title"], MAX.name);
      const description = clip(s(body["description"]), MAX.description);
      const category = s(body["category"], MAX.category) ?? "Services";
      const subcategory = s(body["subcategory"], MAX.subcategory);

      const rawImage = s(body["image"], MAX.imageUrl) ?? s(body["thumbnailUrl"], MAX.imageUrl);
      const image = rawImage && isAllowedUrl(rawImage) ? rawImage : undefined;

      const gallery = nGallery(body["gallery"], MAX.imageUrl, MAX.galleryCount);
      const galleryAllowed = (gallery ?? []).filter(isAllowedUrl);
      const finalGallery = Array.from(new Set([...(image ? [image] : []), ...galleryAllowed])).slice(
        0,
        MAX.galleryCount
      );

      const hasRateTypeKey = Object.prototype.hasOwnProperty.call(body, "rateType");
      const parsedRateType = nRateType(body["rateType"]);
      const rateType: "hour" | "day" | "fixed" = parsedRateType ?? "fixed";
      if (hasRateTypeKey && !parsedRateType) {
        track("service_create_validation_error", { reqId, userId: me.id, field: "rateType", reason: "invalid" });
        return withReqId(
          noStore({ error: "Invalid rateType (use hour, day, or fixed)" }, { status: 400 }),
          reqId,
          idemKey
        );
      }

      const serviceArea = s(body["serviceArea"], MAX.serviceArea);
      const availability = s(body["availability"], MAX.availability);
      const location = s(body["location"], MAX.location) ?? serviceArea;

      const price = nPrice(body["price"]);
      const hasPriceKey = Object.prototype.hasOwnProperty.call(body, "price");

      let sellerPhone = normalizeMsisdn(s(body["sellerPhone"]));
      if (!sellerPhone && me.whatsapp) sellerPhone = normalizeMsisdn(me.whatsapp);

      if (!name || name.length < 3) {
        track("service_create_validation_error", { reqId, userId: me.id, field: "name" });
        return withReqId(noStore({ error: "Name is required (min 3 chars)" }, { status: 400 }), reqId, idemKey);
      }
      if (!description || description.length < 10) {
        track("service_create_validation_error", { reqId, userId: me.id, field: "description" });
        return withReqId(
          noStore({ error: "Description is required (min 10 chars)" }, { status: 400 }),
          reqId,
          idemKey
        );
      }
      if (hasPriceKey && price === undefined) {
        track("service_create_validation_error", { reqId, userId: me.id, field: "price", reason: "invalid" });
        return withReqId(noStore({ error: "Invalid price" }, { status: 400 }), reqId, idemKey);
      }
      if (typeof body["sellerPhone"] === "string" && !normalizeMsisdn(body["sellerPhone"] as string)) {
        track("service_create_validation_error", { reqId, userId: me.id, field: "sellerPhone", reason: "invalid" });
        return withReqId(
          noStore({ error: "Invalid sellerPhone. Use 07/01, +2547/+2541, or 2547/2541." }, { status: 400 }),
          reqId,
          idemKey
        );
      }

      const tier = toTier(me.subscription);
      const limits = LIMITS[tier];
      const myActiveCount = await db.service.count({ where: { sellerId: me.id, status: "ACTIVE" } });
      if (myActiveCount >= limits.listingLimit) {
        track("service_create_limit_reached", { reqId, userId: me.id, tier, limit: limits.listingLimit });
        return withReqId(noStore({ error: `Listing limit reached for ${tier}` }, { status: 403 }), reqId, idemKey);
      }

      const created = await createServiceSafe({
        name,
        description,
        category,
        subcategory: subcategory ?? null,
        price: price ?? null,
        rateType,
        serviceArea: serviceArea ?? null,
        availability: availability ?? null,
        image: (image ?? null) as string | null,
        gallery: finalGallery,
        location: location ?? null,
        status: "ACTIVE",
        featured: false,
        publishedAt: new Date(), // stripped if column missing
        sellerId: me.id,
        sellerName: me.name ?? null,
        sellerLocation: me.city ? [me.city, me.country].filter(Boolean).join(", ") : me.country ?? null,
        sellerMemberSince: me.createdAt ? me.createdAt.toISOString().slice(0, 10) : null,
        sellerRating: null,
        sellerSales: null,
        sellerPhone: sellerPhone ?? null,
      });

      try {
        revalidateTag("home:active");
        revalidateTag("services:latest");
        revalidateTag(`user:${userId}:services`);
        revalidateTag(`service:${created.id}`);
        revalidatePath("/");
        revalidatePath("/services");
        if (me.username) revalidatePath(`/store/${me.username}`);
        revalidatePath("/dashboard");
        revalidatePath(`/service/${created.id}`);
      } catch {}

      track("service_create_success", {
        reqId,
        userId: me.id,
        tier,
        serviceId: created.id,
        hasPrice: price != null,
        gallerySize: finalGallery.length,
      });

      const res = noStore({ ok: true, serviceId: created.id }, { status: 201 });
      res.headers.set("Location", `/service/${created.id}`);
      return withReqId(res, reqId, idemKey);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error("[services/create POST] error", e);
      track("service_create_error", { reqId, message: e?.message ?? String(e) });

      if (e?.code === "P2002") {
        return withReqId(noStore({ error: "Duplicate value not allowed" }, { status: 409 }), reqId, idemKey);
      }
      return withReqId(noStore({ error: "Server error" }, { status: 500 }), reqId, idemKey);
    }
  });
}

/* ----------------------------- CORS ----------------------------- */
export function OPTIONS() {
  const origin = process.env["NEXT_PUBLIC_APP_URL"] ?? process.env["APP_ORIGIN"] ?? "*";
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
