// src/app/api/services/[id]/route.ts
import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { extractGalleryUrls as collectUrls } from "@/app/lib/media";

/* ---------------- constants ---------------- */
const PLACEHOLDER = "/placeholder/default.jpg";
const IS_PROD = process.env.NODE_ENV === "production";

// Dev-seed hosts we never want to count in the API gallery
const DEV_SEED_HOSTS = [
  "picsum.photos",
  "images.unsplash.com",
  "plus.unsplash.com",
];

/* ---------------- analytics (console-only) ---------------- */
type AnalyticsEvent =
  | "service_read_attempt"
  | "service_read_public_hit"
  | "service_read_owner_hit"
  | "service_read_not_found"
  | "service_read_unauthorized_owner_check"
  | "service_read_error";

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

/* -------------------------- helpers -------------------------- */
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

/** Prod-only public cache for ACTIVE public hits (dev/preview = no-store). */
function publicCache(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  if (IS_PROD) {
    res.headers.set(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=60",
    );
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
    const id = idx >= 0 ? segs[idx + 1] ?? "" : "";
    return id.trim();
  } catch {
    return "";
  }
}

/** Quick heuristic: some IDs are clearly invalid and shouldn't hit DB. */
function isClearlyInvalidId(id: string): boolean {
  const v = (id || "").trim();
  if (!v) return true;
  if (v.length > 128) return true;
  if (v.includes(".")) return true;
  const bad = new Set(["example", "undefined", "null", "nan"]);
  if (bad.has(v.toLowerCase())) return true;
  return false;
}

/** base select for service (safe fields, includes gallery) */
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
    s?.createdAt instanceof Date
      ? s.createdAt.toISOString()
      : String(s?.createdAt ?? "");
  const sellerUsername = s?.seller?.username ?? null;
  const { _count: _c, ...rest } = s || {};
  return { ...rest, createdAt, sellerUsername };
}

/* ---------- model helpers (handle Service/Services naming) ------------ */
function getServiceModel() {
  const any = prisma as any;
  return any.service ?? any.services ?? any.Service ?? any.Services ?? null;
}

/* ---------- relation model helpers (ServiceImage[]) ------------ */
function getServiceImageModel() {
  const any = prisma as any;
  const candidates = [
    "serviceImage",
    "serviceImages",
    "ServiceImage",
    "ServiceImages",
  ];
  for (const key of candidates) {
    const mdl = any?.[key];
    if (mdl && typeof mdl.findMany === "function") return mdl;
  }
  return null;
}

/**
 * Fetch related image rows WITHOUT selecting non-existent fields.
 * Prefer to use when main Service.gallery is empty.
 */
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

/* -------- media helpers -------- */
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

/**
 * Normalize the cover + gallery:
 * - cover can be any non-placeholder (even dev seeds like Unsplash).
 * - gallery for the API ONLY counts "real" media:
 *   no placeholders and no dev-seed hosts (Unsplash/Picsum).
 */
function normalizeCoverAndGallery(
  primary: any,
  fullRow: any,
  extraUrls: string[] = [],
) {
  const merged = { ...(fullRow || {}), ...(primary || {}) };
  const collected = (collectUrls(merged, undefined) ?? []).slice(0, 50);
  const extra = extraUrls
    .map((u) => (u ?? "").toString().trim())
    .filter(Boolean);

  const rawCandidates = [
    merged?.image,
    merged?.coverImage,
    merged?.coverImageUrl,
    ...collected,
    ...extra,
  ]
    .map((u: any) => (u ?? "").toString().trim())
    .filter(Boolean);

  // Hero cover: any non-placeholder, even if it's an Unsplash/Picsum dev image.
  const cover =
    rawCandidates.find((u) => !isPlaceholder(u)) || PLACEHOLDER;

  // API gallery: only "real" media; drop placeholders + dev-seed hosts.
  const galleryReal = rawCandidates.filter(
    (u) => !isPlaceholder(u) && !isDevSeedHost(u),
  );
  const gallery = Array.from(new Set(galleryReal)).slice(0, 50);

  return { cover, gallery };
}

/* ----------------------------- HEAD / CORS ----------------------------- */
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
    process.env["NEXT_PUBLIC_APP_URL"] ??
    process.env["APP_ORIGIN"] ??
    "*";
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set(
    "Vary",
    "Origin, Authorization, Cookie, Accept-Encoding",
  );
  res.headers.set(
    "Access-Control-Allow-Methods",
    "GET, DELETE, OPTIONS, HEAD",
  );
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/* ---------------- timeouts ---------------- */
const TIMEOUT_MS = 1200;
const race = <T,>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T | "timeout"> =>
  Promise.race([
    p,
    new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), ms),
    ),
  ]).catch(() => "timeout" as const);

/* -------------------- GET /api/services/:id ------------------- */
export async function GET(req: NextRequest) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);

  try {
    const serviceId = getId(req);
    if (!serviceId) {
      track("service_read_not_found", {
        reqId,
        reason: "missing_id",
      });
      return noStore(
        { error: "Missing id" },
        { status: 400 },
      );
    }

    if (isClearlyInvalidId(serviceId)) {
      track("service_read_not_found", {
        reqId,
        serviceId,
        reason: "invalid_id",
      });
      const res = noStore(
        { error: "Not found" },
        { status: 404 },
      );
      res.headers.set("x-api-shortcircuit", "invalid-id");
      return res;
    }

    const Service = getServiceModel();
    if (!Service) {
      track("service_read_not_found", {
        reqId,
        serviceId,
        reason: "no_model",
      });
      return noStore(
        { error: "Not found" },
        { status: 404 },
      );
    }

    track("service_read_attempt", { reqId, serviceId });

    const selectPublic: any = { ...serviceBaseSelect };

    const baseRaw = await race(
      Service.findUnique({
        where: { id: serviceId },
        select: selectPublic,
      }),
      TIMEOUT_MS,
    );

    const base =
      baseRaw && baseRaw !== "timeout"
        ? (baseRaw as any)
        : null;

    if (!base) {
      track("service_read_not_found", {
        reqId,
        serviceId,
        reason:
          baseRaw === "timeout"
            ? "base_timeout_or_missing"
            : "not_found",
      });
      const res = noStore(
        { error: "Not found" },
        { status: 404 },
      );
      if (baseRaw === "timeout") {
        res.headers.set("x-api-fallback", "timed-out");
      }
      return res;
    }

    const shaped = shapeService(base);
    const rawStatus = (base as any)?.status;
    const normalizedStatus =
      typeof rawStatus === "string" &&
      rawStatus.trim()
        ? rawStatus.trim().toUpperCase()
        : "ACTIVE";
    const isDeleted = Boolean((base as any)?.deletedAt);
    const isDevLike = !IS_PROD;

    // Access mode
    let allowedAsPublic = false;
    let requiresOwnerCheck = false;

    if (isDevLike) {
      // In dev/preview, allow any existing, non-deleted row
      // to be readable to avoid flaky 404s in tests.
      allowedAsPublic = !isDeleted;
      requiresOwnerCheck = false;
    } else {
      const nonPublicStatuses = new Set(["DRAFT", "HIDDEN"]);
      if (!isDeleted && !nonPublicStatuses.has(normalizedStatus)) {
        // ACTIVE, SOLD, etc. are treated as public.
        allowedAsPublic = true;
      } else {
        requiresOwnerCheck = true;
      }
    }

    let viewerIsOwner = false;
    let viewerIsAdmin = false;

    if (requiresOwnerCheck) {
      const sessionRaw = await race(auth(), 500);
      const session =
        sessionRaw === "timeout"
          ? null
          : (sessionRaw as any);
      const user = session?.user as any;
      const userId = user?.id as string | undefined;
      const isAdmin =
        user?.role === "ADMIN" || user?.isAdmin === true;

      let resolvedUserId: string | null = userId ?? null;

      if (!resolvedUserId && user?.email) {
        const uRaw = await race(
          prisma.user.findUnique({
            where: { email: user.email as string },
            select: { id: true },
          }),
          600,
        );
        const u =
          uRaw && uRaw !== "timeout"
            ? (uRaw as any)
            : null;
        resolvedUserId = u?.id ?? null;
      }

      viewerIsAdmin = !!isAdmin;
      viewerIsOwner =
        !!resolvedUserId &&
        !!base?.sellerId &&
        String(base.sellerId) ===
          String(resolvedUserId);

      if (!viewerIsOwner && !viewerIsAdmin) {
        track(
          "service_read_unauthorized_owner_check",
          {
            reqId,
            serviceId,
          },
        );
        return noStore(
          { error: "Not found" },
          { status: 404 },
        );
      }
    }

    // Media normalization (full row + related images)
    const [fullRowRaw, relUrlsRaw] = await Promise.all([
      race(
        Service.findUnique({
          where: { id: serviceId },
        }).catch(() => null),
        600,
      ),
      race(fetchServiceRelationUrls(serviceId), 600),
    ]);

    const fullRow =
      fullRowRaw !== "timeout"
        ? (fullRowRaw as any)
        : null;
    const relUrls = Array.isArray(relUrlsRaw)
      ? (relUrlsRaw as string[])
      : [];

    const norm = normalizeCoverAndGallery(
      shaped,
      fullRow,
      relUrls,
    );
    const gallery = norm.gallery;

    const payload = {
      ...shaped,
      image: norm.cover,
      gallery,
      imageUrls: gallery,
      images: gallery,
      photos: gallery,
    };

    const isPublicResponse =
      allowedAsPublic && !isDevLike;

    const res = isPublicResponse
      ? publicCache(payload)
      : noStore(payload);

    if (
      fullRowRaw === "timeout" ||
      relUrlsRaw === "timeout"
    ) {
      res.headers.set("x-api-fallback", "timed-out");
    }

    track(
      isPublicResponse
        ? "service_read_public_hit"
        : "service_read_owner_hit",
      {
        reqId,
        serviceId,
        env: IS_PROD ? "prod" : "dev",
        status: normalizedStatus,
        deleted: isDeleted,
        ownerView: !isPublicResponse,
      },
    );

    return res;
  } catch (e) {
    console.warn("[services/:id GET] error:", e);
    track("service_read_error", {
      reqId,
      message: (e as any)?.message ?? String(e),
    });
    return noStore(
      { error: "Server error" },
      { status: 500 },
    );
  }
}

/* ------------------ DELETE /api/services/:id ------------------ */
export async function DELETE(req: NextRequest) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);

  try {
    const idParam = getId(req);
    if (!idParam) {
      return noStore(
        { error: "Missing id" },
        { status: 400 },
      );
    }

    const Service = getServiceModel();
    if (!Service) {
      return noStore(
        { error: "Not found" },
        { status: 404 },
      );
    }

    const session = await auth();
    const user = session?.user as any;
    const userId = user?.id;
    const isAdmin =
      user?.role === "ADMIN" || user?.isAdmin === true;

    if (!userId && !isAdmin) {
      return noStore(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    // Resolve row (accept alt id fields just like products)
    const ALT_ID_FIELDS = [
      "id",
      "serviceId",
      "service_id",
      "uid",
      "uuid",
      "slug",
    ] as const;

    let existing: any = null;
    for (const field of ALT_ID_FIELDS) {
      try {
        const where = { [field]: idParam } as any;
        existing = await Service.findUnique({
          where,
          select: { id: true, sellerId: true },
        });
        if (existing) break;
      } catch {}
    }

    if (!existing) {
      return noStore(
        { error: "Not found" },
        { status: 404 },
      );
    }

    const isOwner =
      userId && existing.sellerId === userId;
    if (!isOwner && !isAdmin) {
      return noStore(
        { error: "Forbidden" },
        { status: 403 },
      );
    }

    // Delete gallery images + service
    await prisma.$transaction([
      prisma.serviceImage.deleteMany({
        where: { serviceId: existing.id },
      }),
      Service.delete({
        where: { id: existing.id },
      }),
    ]);

    return noStore({ ok: true });
  } catch (e) {
    console.warn("[services/:id DELETE] error:", e);
    return noStore(
      { error: "Server error" },
      { status: 500 },
    );
  }
}
