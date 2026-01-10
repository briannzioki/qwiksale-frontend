import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { extractGalleryUrls as collectUrls } from "@/app/lib/media";
import type { SellerBadgeFields } from "@/app/lib/sellerVerification";
import {
  buildSellerBadgeFields,
  resolveSellerBadgeFieldsFromUserLike,
} from "@/app/lib/sellerVerification";

const PLACEHOLDER = "/placeholder/default.jpg";
const IS_PROD = process.env.NODE_ENV === "production";

const DEV_SEED_HOSTS = ["picsum.photos", "images.unsplash.com", "plus.unsplash.com"];

type AnalyticsEvent =
  | "service_read_attempt"
  | "service_read_public_hit"
  | "service_read_owner_hit"
  | "service_read_not_found"
  | "service_read_unauthorized_owner_check"
  | "service_read_error"
  | "service_read_timeout";

function track(event: AnalyticsEvent, props?: Record<string, unknown>) {
  try {
    console.log(`[track] ${event}`, {
      ts: new Date().toISOString(),
      ...props,
    });
  } catch {
    // ignore
  }
}

function baseHeaders(h = new Headers()) {
  h.set("Vary", "Authorization, Cookie, Accept-Encoding, Origin");
  return h;
}

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  baseHeaders(res.headers);
  return res;
}

function publicCache(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  if (IS_PROD) {
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=60");
  } else {
    res.headers.set("Cache-Control", "no-store");
  }
  baseHeaders(res.headers);
  return res;
}

function getId(req: NextRequest): string {
  try {
    const segs = req.nextUrl.pathname.split("/");
    const idx = segs.findIndex((s) => s === "services");
    const id = idx >= 0 ? (segs[idx + 1] ?? "") : "";
    return id.trim();
  } catch {
    return "";
  }
}

function isClearlyInvalidId(id: string): boolean {
  const v = (id || "").trim();
  if (!v) return true;
  if (v.length > 128) return true;
  if (v.includes(".")) return true;
  const bad = new Set(["example", "undefined", "null", "nan"]);
  if (bad.has(v.toLowerCase())) return true;
  return false;
}

async function fetchSellerBadgeFieldsById(
  sellerId: string | null | undefined,
): Promise<SellerBadgeFields | null> {
  if (!sellerId) return null;
  try {
    const rows = await prisma.$queryRaw<{ u: any }[]>`
      SELECT row_to_json(u) as u
      FROM "User" u
      WHERE u.id = ${sellerId}
      LIMIT 1
    `;
    const u = rows?.[0]?.u ?? null;
    return u ? (resolveSellerBadgeFieldsFromUserLike(u) as SellerBadgeFields) : null;
  } catch {
    return null;
  }
}

function isAnonRequest(req: NextRequest) {
  const authz = req.headers.get("authorization");
  const cookie = req.headers.get("cookie");
  return !authz && !cookie;
}

const serviceBaseSelect = {
  id: true,
  name: true,
  description: true,
  category: true,
  subcategory: true,
  price: true,
  rateType: true,
  image: true,
  gallery: true,
  location: true,
  serviceArea: true,
  availability: true,
  featured: true,
  createdAt: true,
  sellerId: true,
  status: true,
  sellerName: true,
  sellerLocation: true,
  sellerMemberSince: true,
  sellerRating: true,
  sellerSales: true,
  seller: {
    select: { id: true, username: true, name: true, image: true },
  },
} as const;

function shapeService(s: any) {
  const createdAt =
    s?.createdAt instanceof Date ? s.createdAt.toISOString() : String(s?.createdAt ?? "");
  const sellerUsername = s?.seller?.username ?? null;
  const { _count: _c, ...rest } = s || {};
  return { ...rest, createdAt, sellerUsername };
}

function getServiceModel() {
  const any = prisma as any;
  return any.service ?? any.services ?? any.Service ?? any.Services ?? null;
}

function getServiceImageModel() {
  const any = prisma as any;
  const candidates = ["serviceImage", "serviceImages", "ServiceImage", "ServiceImages"];
  for (const key of candidates) {
    const mdl = any?.[key];
    if (mdl && typeof mdl.findMany === "function") return mdl;
  }
  return null;
}

async function fetchServiceRelationUrls(serviceId: string): Promise<string[]> {
  try {
    const Model = getServiceImageModel();
    if (!Model) return [];
    const rows: any[] =
      (await Model.findMany({
        where: { serviceId },
        orderBy: { id: "asc" },
        take: 50,
      }).catch(() => [])) ?? [];
    const urls = new Set<string>();
    for (const r of rows) {
      const u =
        r?.url ??
        r?.src ??
        r?.href ??
        r?.uri ??
        r?.imageUrl ??
        r?.image ??
        r?.path ??
        r?.location ??
        "";
      const t = String(u ?? "").trim();
      if (t) urls.add(t);
    }
    return Array.from(urls);
  } catch {
    return [];
  }
}

function isPlaceholder(u?: string | null) {
  if (!u) return false;
  const s = String(u).trim();
  if (!s) return false;
  return s === PLACEHOLDER || s.endsWith("/placeholder/default.jpg");
}

function isDevSeedHost(u?: string | null) {
  if (!u) return false;
  const s = String(u).toLowerCase();
  return DEV_SEED_HOSTS.some((h) => s.includes(h));
}

function normalizeCoverAndGallery(primary: any, fullRow: any, extraUrls: string[] = []) {
  const merged = { ...(fullRow || {}), ...(primary || {}) };
  const collected = (collectUrls(merged, undefined) ?? []).slice(0, 50);
  const extra = extraUrls.map((u) => (u ?? "").toString().trim()).filter(Boolean);

  const rawCandidates = [
    merged?.image,
    merged?.coverImage,
    merged?.coverImageUrl,
    ...collected,
    ...extra,
  ]
    .map((u: any) => (u ?? "").toString().trim())
    .filter(Boolean);

  const cover = rawCandidates.find((u) => !isPlaceholder(u)) || PLACEHOLDER;

  const galleryReal = rawCandidates.filter((u) => !isPlaceholder(u) && !isDevSeedHost(u));
  const gallery = Array.from(new Set(galleryReal)).slice(0, 50);

  return { cover, gallery };
}

export function HEAD() {
  const h = baseHeaders(new Headers());
  h.set("Allow", "GET, OPTIONS, HEAD");
  h.set("Cache-Control", "no-store, no-cache, must-revalidate");
  h.set("Pragma", "no-cache");
  h.set("Expires", "0");
  return new Response(null, { status: 204, headers: h });
}

export function OPTIONS() {
  const origin =
    process.env["NEXT_PUBLIC_APP_URL"] ?? process.env["APP_ORIGIN"] ?? "*";
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin, Authorization, Cookie, Accept-Encoding");
  res.headers.set("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS, HEAD");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

const TIMEOUT_MS = 1200;
const race = <T,>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T | "timeout"> =>
  Promise.race([
    p,
    new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms)),
  ]).catch(() => "timeout" as const);

function normalizeStatus(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  return s ? s.toUpperCase() : "ACTIVE";
}

function isPubliclyViewableStatus(status: string): boolean {
  // Repo-wide expectation: public pages only expose ACTIVE listings.
  // Empty/missing values are treated as ACTIVE for backwards compatibility.
  return normalizeStatus(status) === "ACTIVE";
}

async function resolveViewerIdFromSession(session: any): Promise<string | null> {
  const user = session?.user as any;
  const userId = typeof user?.id === "string" ? user.id.trim() : "";
  if (userId) return userId;

  const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
  if (!email) return null;

  const uRaw = await race(
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    600,
  );
  const u = uRaw && uRaw !== "timeout" ? (uRaw as any) : null;
  const resolved = typeof u?.id === "string" ? u.id.trim() : u?.id ? String(u.id).trim() : "";
  return resolved || null;
}

export async function GET(req: NextRequest) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  try {
    const serviceId = getId(req);
    if (!serviceId) {
      track("service_read_not_found", { reqId, reason: "missing_id" });
      return noStore({ error: "Missing id" }, { status: 400 });
    }

    if (isClearlyInvalidId(serviceId)) {
      track("service_read_not_found", { reqId, serviceId, reason: "invalid_id" });
      const res = noStore({ error: "Not found" }, { status: 404 });
      res.headers.set("x-api-shortcircuit", "invalid-id");
      return res;
    }

    const Service = getServiceModel();
    if (!Service) {
      track("service_read_not_found", { reqId, serviceId, reason: "no_model" });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    track("service_read_attempt", { reqId, serviceId });

    const baseRaw = await race(
      Service.findUnique({
        where: { id: serviceId },
        select: { ...serviceBaseSelect },
      }),
      TIMEOUT_MS,
    );

    if (baseRaw === "timeout") {
      track("service_read_timeout", { reqId, serviceId, stage: "base" });
      const res = noStore({ error: "Temporarily unavailable" }, { status: 503 });
      res.headers.set("x-api-fallback", "timed-out");
      return res;
    }

    const base = baseRaw ? (baseRaw as any) : null;

    if (!base) {
      track("service_read_not_found", { reqId, serviceId, reason: "not_found" });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    const shaped = shapeService(base);

    const normalizedStatus = normalizeStatus((base as any)?.status);
    const isDeleted = Boolean((base as any)?.deletedAt);

    const publicViewable = !isDeleted && isPubliclyViewableStatus(normalizedStatus);

    // If it is not publicly viewable and there is no auth context, do not even attempt owner checks.
    if (!publicViewable && isAnonRequest(req)) {
      track("service_read_unauthorized_owner_check", { reqId, serviceId, reason: "anon_private" });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    if (!publicViewable) {
      const sessionRaw = await race(auth(), 500);
      const session = sessionRaw === "timeout" ? null : (sessionRaw as any);
      const user = session?.user as any;

      const roleRaw = typeof user?.role === "string" ? user.role : "";
      const isAdmin = roleRaw.toUpperCase() === "ADMIN" || user?.isAdmin === true;

      const resolvedUserId = await resolveViewerIdFromSession(session);

      const viewerIsOwner =
        !!resolvedUserId &&
        !!base?.sellerId &&
        String(base.sellerId) === String(resolvedUserId);

      if (!viewerIsOwner && !isAdmin) {
        track("service_read_unauthorized_owner_check", { reqId, serviceId });
        return noStore({ error: "Not found" }, { status: 404 });
      }
    }

    const [fullRowRaw, relUrlsRaw] = await Promise.all([
      race(Service.findUnique({ where: { id: serviceId } }).catch(() => null), 600),
      race(fetchServiceRelationUrls(serviceId), 600),
    ]);

    const fullRow = fullRowRaw !== "timeout" ? (fullRowRaw as any) : null;
    const relUrls = Array.isArray(relUrlsRaw) ? (relUrlsRaw as string[]) : [];

    const norm = normalizeCoverAndGallery(shaped, fullRow, relUrls);
    const gallery = norm.gallery;

    const sellerFieldsRaw = await race(fetchSellerBadgeFieldsById(shaped?.sellerId), 650);
    const sellerFields =
      sellerFieldsRaw !== "timeout"
        ? (sellerFieldsRaw as SellerBadgeFields | null)
        : null;

    const badges = sellerFields ?? buildSellerBadgeFields(null, null);

    const payload = {
      ...shaped,
      sellerBadges: badges.sellerBadges,
      sellerVerified: badges.sellerVerified,
      sellerFeaturedTier: badges.sellerFeaturedTier,
      image: norm.cover,
      gallery,
      imageUrls: gallery,
      images: gallery,
      photos: gallery,
    };

    const res =
      publicViewable && isAnonRequest(req) ? publicCache(payload) : noStore(payload);

    if (fullRowRaw === "timeout" || relUrlsRaw === "timeout") {
      res.headers.set("x-api-fallback", "timed-out");
    }

    track(publicViewable ? "service_read_public_hit" : "service_read_owner_hit", {
      reqId,
      serviceId,
      env: IS_PROD ? "prod" : "dev",
      status: normalizedStatus,
      deleted: isDeleted,
      ownerView: !publicViewable,
    });

    return res;
  } catch (e) {
    console.warn("[services/:id GET] error:", e);
    track("service_read_error", { reqId, message: (e as any)?.message ?? String(e) });
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  try {
    const idParam = getId(req);
    if (!idParam) return noStore({ error: "Missing id" }, { status: 400 });

    const Service = getServiceModel();
    if (!Service) return noStore({ error: "Not found" }, { status: 404 });

    const session = await auth();
    const user = session?.user as any;
    const userId = user?.id;
    const roleRaw = typeof user?.role === "string" ? user.role : "";
    const isAdmin = roleRaw.toUpperCase() === "ADMIN" || user?.isAdmin === true;

    if (!userId && !isAdmin) return noStore({ error: "Unauthorized" }, { status: 401 });

    const ALT_ID_FIELDS = ["id", "serviceId", "service_id", "uid", "uuid", "slug"] as const;

    let existing: any = null;
    for (const field of ALT_ID_FIELDS) {
      try {
        const where = { [field]: idParam } as any;
        existing = await Service.findUnique({ where, select: { id: true, sellerId: true } });
        if (existing) break;
      } catch {
        // try next
      }
    }

    if (!existing) return noStore({ error: "Not found" }, { status: 404 });

    const isOwner = userId && existing.sellerId === userId;
    if (!isOwner && !isAdmin) return noStore({ error: "Forbidden" }, { status: 403 });

    const ImageModel = getServiceImageModel();

    const ops: any[] = [];
    if (ImageModel && typeof (ImageModel as any).deleteMany === "function") {
      ops.push((ImageModel as any).deleteMany({ where: { serviceId: existing.id } }));
    } else {
      const anyPrisma = prisma as any;
      if (anyPrisma?.serviceImage?.deleteMany) {
        ops.push(anyPrisma.serviceImage.deleteMany({ where: { serviceId: existing.id } }));
      }
    }

    ops.push(Service.delete({ where: { id: existing.id } }));

    await prisma.$transaction(ops);

    return noStore({ ok: true });
  } catch (e) {
    console.warn("[services/:id DELETE] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
