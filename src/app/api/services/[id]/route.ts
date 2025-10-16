import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { revalidatePath, revalidateTag } from "next/cache";
import { extractGalleryUrls as collectUrls } from "@/app/lib/media";

/* ---------------- constants ---------------- */
const PLACEHOLDER = "/placeholder/default.jpg";

/* ---------------- analytics (console-only for now) ---------------- */
type AnalyticsEvent =
  | "service_read_attempt"
  | "service_read_public_hit"
  | "service_read_not_found"
  | "service_read_error"
  | "service_update_attempt"
  | "service_update_unauthorized"
  | "service_update_forbidden"
  | "service_update_not_found"
  | "service_update_success"
  | "service_update_error"
  | "service_delete_attempt"
  | "service_delete_unauthorized"
  | "service_delete_forbidden"
  | "service_delete_not_found"
  | "service_delete_success"
  | "service_delete_error";

function track(event: AnalyticsEvent, props?: Record<string, unknown>) {
  try {
    console.log(`[track] ${event}`, { ts: new Date().toISOString(), ...props });
  } catch {}
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

/** Prod-only public cache for ACTIVE public hits. (Dev = no-store) */
function publicCache(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  const prod = process.env.NODE_ENV === "production";
  if (prod) {
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
    s?.createdAt instanceof Date ? s.createdAt.toISOString() : String(s?.createdAt ?? "");
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
  const candidates = ["serviceImage", "serviceImages", "ServiceImage", "ServiceImages"];
  for (const key of candidates) {
    const mdl = any?.[key];
    if (mdl && typeof mdl.findMany === "function") return mdl;
  }
  return null;
}

/**
 * Fetch related image rows WITHOUT selecting non-existent fields.
 * - No `select` clause (avoids Prisma errors on unknown columns like `secureUrl`)
 * - Prefer to use this only when the main Service.gallery is empty.
 */
async function fetchServiceRelationUrls(serviceId: string): Promise<string[]> {
  try {
    const Model = getServiceImageModel();
    if (!Model) return [];

    // No `select` → Prisma returns model-defined fields only. We only read from safe keys.
    const rows: any[] =
      (await Model.findMany({
        where: { serviceId },
        orderBy: { id: "asc" },
        take: 50,
      }).catch(() => [])) ?? [];

    const urls = new Set<string>();
    for (const r of rows) {
      // DO NOT use/expect `secureUrl` here.
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

function normalizeCoverAndGallery(primary: any, fullRow: any, extraUrls: string[] = []) {
  const merged = { ...(fullRow || {}), ...(primary || {}) };
  const collected = (collectUrls(merged, undefined) ?? []).slice(0, 50);
  const extra = extraUrls.map((u) => (u ?? "").toString().trim()).filter(Boolean);
  const rawCandidates = [merged?.image, merged?.coverImage, merged?.coverImageUrl, ...collected, ...extra]
    .map((u: any) => (u ?? "").toString().trim())
    .filter(Boolean);
  const firstReal = rawCandidates.find((u) => !isPlaceholder(u));
  const cover = firstReal || PLACEHOLDER;
  const realGallery = rawCandidates.filter((u) => !isPlaceholder(u));
  const gallery = realGallery.length ? Array.from(new Set([cover, ...realGallery])) : [PLACEHOLDER];
  return { cover, gallery: gallery.slice(0, 50) };
}

/* -------------------- GET /api/services/:id ------------------- */
function normalizeUrl(u: unknown): string | null {
  if (typeof u === "string") return u.trim() || null;
  if (u && typeof u === "object") {
    const maybe =
      (u as any).url ??
      (u as any).secure_url ?? // ✅ accept Cloudinary key
      (u as any).secureUrl ??  // ✅ accept camelCase variant
      (u as any).src ??
      (u as any).href ??
      (u as any).uri ??
      (u as any).signedUrl ??
      (u as any).downloadURL;
    if (typeof maybe === "string") return maybe.trim() || null;
  }
  return null;
}

function pickName(row: any): string {
  const v = (row?.name ?? row?.title ?? "").toString().trim();
  return v || "Service";
}

function buildGallery(row: any): string[] {
  const out = new Set<string>();
  const pushMany = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const it of arr) {
      const url = normalizeUrl(it);
      if (url) out.add(url);
    }
  };
  pushMany(row?.gallery);
  pushMany(row?.images);
  pushMany(row?.photos);
  pushMany(row?.media);
  pushMany(row?.imageUrls);
  const single = normalizeUrl(row?.image);
  if (single && !isPlaceholder(single)) out.add(single);
  return Array.from(out).slice(0, 50);
}

/* ---- accepted alt id fields for Attempt B ---- */
const ALT_ID_FIELDS = ["id", "serviceId", "service_id", "uid", "uuid", "slug"] as const;

type Row = any | null | "timeout";
/** ⬆ raised to reduce early fallback under cold Prisma */
const TIMEOUT_MS = 4500;

const race = <T,>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T | "timeout"> =>
  Promise.race([
    p,
    new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms)),
  ]).catch(() => "timeout" as const);

/** Exactly two attempts total. */
async function twoAttemptSelect(
  Service: any,
  idParam: string
): Promise<{ row: Row; timedOut: boolean }> {
  let timedOut = false;

  // Attempt A: findUnique({ where: { id } })
  try {
    const r = (await race(
      Service.findUnique({ where: { id: idParam }, select: serviceBaseSelect as any }),
      TIMEOUT_MS
    )) as Row;
    if (r === "timeout") timedOut = true;
    if (r && r !== "timeout") return { row: r, timedOut };
  } catch {}

  // Attempt B: findFirst({ where: { OR: [...] } })
  try {
    const OR = ALT_ID_FIELDS.map((f) => ({ [f]: idParam })) as any[];
    const r = (await race(
      Service.findFirst({ where: { OR }, select: serviceBaseSelect as any }),
      TIMEOUT_MS
    )) as Row;
    if (r === "timeout") timedOut = true;
    if (r && r !== "timeout") return { row: r, timedOut };
  } catch {}

  return { row: null, timedOut };
}

export async function GET(req: NextRequest) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  try {
    const Service = getServiceModel();
    const idParam = getId(req);

    if (!Service) {
      track("service_read_not_found", { reqId, reason: "no_model" });
      return noStore({ error: "Not found" }, { status: 404 });
    }
    if (!idParam) {
      track("service_read_not_found", { reqId, reason: "missing_id" });
      return noStore({ error: "Missing id" }, { status: 400 });
    }

    track("service_read_attempt", { reqId, serviceId: idParam });

    // Exactly TWO races total, each capped by TIMEOUT_MS
    const { row, timedOut } = await twoAttemptSelect(Service, idParam);

    // Deterministic fallback on timeout or not found
    if (!row || row === "timeout") {
      const minimal = {
        id: idParam,
        name: "Service",
        image: PLACEHOLDER,
        gallery: [PLACEHOLDER] as string[],
      };
      const res = noStore(minimal, { status: 200 });
      res.headers.set("x-api-fallback", timedOut ? "timed-out" : "not-found");
      track("service_read_public_hit", {
        reqId,
        serviceId: idParam,
        fallback: true,
        timedOut: !!timedOut,
      });
      return res;
    }

    // Prefer Service.gallery first; only consult relation if necessary
    const primaryGallery = buildGallery(row);
    let relSafe: string[] = [];
    if (primaryGallery.length === 0) {
      const relUrls = (await race(fetchServiceRelationUrls((row as any).id ?? idParam), 600)) as
        | string[]
        | "timeout";
      relSafe = Array.isArray(relUrls) ? relUrls : [];
    }

    const shaped = shapeService(row);
    const norm = normalizeCoverAndGallery(
      { ...shaped, image: shaped.image, gallery: primaryGallery },
      row,
      relSafe
    );

    // Canonicalize id
    const canonicalId = String(
      (row as any).id ??
        (row as any).serviceId ??
        (row as any).service_id ??
        (row as any).uid ??
        (row as any).uuid ??
        (row as any).slug ??
        idParam
    );

    const payload = {
      ...shaped,
      id: canonicalId,
      name: pickName(row),
      image: norm.cover,
      gallery: norm.gallery,
    };

    track("service_read_public_hit", { reqId, serviceId: canonicalId });
    return publicCache(payload, { status: 200 });
  } catch (e) {
    console.warn("[services/:id GET] error:", e);
    track("service_read_error", { reqId, message: (e as any)?.message ?? String(e) });
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* ------------------- PATCH /api/services/:id ------------------ */
export async function PATCH(req: NextRequest) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  try {
    const serviceId = getId(req);
    if (!serviceId) {
      track("service_update_not_found", { reqId, reason: "missing_id" });
      return noStore({ error: "Missing id" }, { status: 400 });
    }

    const Service = getServiceModel();
    if (!Service) {
      track("service_update_not_found", { reqId, serviceId, reason: "no_model" });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    track("service_update_attempt", { reqId, serviceId });

    const session = await auth();
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) {
      track("service_update_unauthorized", { reqId, serviceId });
      return noStore({ error: "Unauthorized" }, { status: 401 });
    }

    // Accept alternate id keys for locating the row on update as well
    let existing: any = null;
    for (const field of ["id", "serviceId", "service_id", "uid", "uuid", "slug"] as const) {
      try {
        const where = { [field]: serviceId } as any;
        existing = await Service.findUnique({ where, select: { id: true, sellerId: true } });
        if (existing) break;
      } catch {}
    }
    if (!existing) {
      track("service_update_not_found", { reqId, serviceId, reason: "no_existing" });
      return noStore({ error: "Not found" }, { status: 404 });
    }
    if (existing.sellerId && existing.sellerId !== userId) {
      track("service_update_forbidden", { reqId, serviceId });
      return noStore({ error: "Forbidden" }, { status: 403 });
    }

    const ctype = req.headers.get("content-type") || "";
    if (!ctype.toLowerCase().includes("application/json")) {
      return noStore({ error: "Content-Type must be application/json" }, { status: 415 });
    }

    const body: any = await req.json().catch(() => ({}));

    const normPrice =
      typeof body?.price === "number"
        ? Math.max(0, Math.round(body.price))
        : body?.price === null
        ? null
        : undefined;

    const normRateType =
      body?.rateType === "hour" || body?.rateType === "day" || body?.rateType === "fixed"
        ? body.rateType
        : body?.rateType == null
        ? undefined
        : undefined;

    const normStatus =
      body?.status === "ACTIVE" || body?.status === "SOLD" || body?.status === "HIDDEN" || body?.status === "DRAFT"
        ? body.status
        : body?.status == null
        ? undefined
        : undefined;

    const normGallery = Array.isArray(body?.gallery)
      ? body.gallery.map((x: unknown) => String(x || "")).filter(Boolean)
      : undefined;

    const data: {
      name?: string;
      description?: string | null;
      category?: string;
      subcategory?: string | null;
      price?: number | null;
      rateType?: "hour" | "day" | "fixed";
      image?: string | null;
      gallery?: string[] | null;
      location?: string | null;
      serviceArea?: string | null;
      availability?: string | null;
      featured?: boolean;
      status?: "ACTIVE" | "SOLD" | "HIDDEN" | "DRAFT";
    } = {};

    if (typeof body?.name === "string") data.name = body.name.trim().slice(0, 140);
    if (typeof body?.description === "string" || body?.description === null)
      data.description = body?.description ?? null;
    if (typeof body?.category === "string") data.category = body.category.slice(0, 64);
    if (typeof body?.subcategory === "string" || body?.subcategory === null)
      data.subcategory = body?.subcategory ?? null;
    if (normPrice !== undefined) data.price = normPrice;
    if (normRateType !== undefined) data.rateType = normRateType as any;
    if (typeof body?.image === "string" || body?.image === null) data.image = body?.image ?? null;
    if (normGallery !== undefined) data.gallery = normGallery;
    if (typeof body?.location === "string" || body?.location === null) data.location = body?.location ?? null;
    if (typeof body?.serviceArea === "string" || body?.serviceArea === null) data.serviceArea = body?.serviceArea ?? null;
    if (typeof body?.availability === "string" || body?.availability === null)
      data.availability = body?.availability ?? null;
    if (typeof body?.featured === "boolean") data.featured = body.featured;
    if (normStatus !== undefined) data.status = normStatus as any;

    // Update by canonical primary key where possible
    const updated = await getServiceModel().update({
      where: { id: existing.id },
      data,
      select: serviceBaseSelect as any,
    });

    const [fullRow, relUrls] = await Promise.all([
      getServiceModel().findUnique({ where: { id: existing.id } }).catch(() => null),
      // prefer row.gallery; only use relation if gallery missing after update
      (async () => {
        const g: string[] = Array.isArray(data.gallery) ? data.gallery : (fullRow?.gallery ?? []);
        if (Array.isArray(g) && g.length > 0) return [] as string[];
        return fetchServiceRelationUrls(existing.id).catch(() => [] as string[]);
      })(),
    ]);

    const shaped = shapeService(updated);
    const norm = normalizeCoverAndGallery({ ...shaped, ...(data || {}) }, fullRow, relUrls || []);

    try {
      revalidateTag("home:active");
      revalidateTag("services:latest");
      revalidateTag(`service:${existing.id}`);
      if (updated?.sellerId) revalidateTag(`user:${updated.sellerId}:listings`);
      revalidatePath("/");
      revalidatePath(`/service/${existing.id}`);
      revalidatePath(`/listing/${existing.id}`);
    } catch {}

    return noStore({ ...shaped, id: String(existing.id), image: norm.cover, gallery: norm.gallery });
  } catch (e) {
    console.warn("[services/:id PATCH] error:", e);
    track("service_update_error", { reqId, message: (e as any)?.message ?? String(e) });
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* ------------------ DELETE /api/services/:id ------------------ */
export async function DELETE(req: NextRequest) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  try {
    const serviceId = getId(req);
    if (!serviceId) {
      track("service_delete_not_found", { reqId, reason: "missing_id" });
      return noStore({ error: "Missing id" }, { status: 400 });
    }

    const Service = getServiceModel();
    if (!Service) {
      track("service_delete_not_found", { reqId, serviceId, reason: "no_model" });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    track("service_delete_attempt", { reqId, serviceId });

    const session = await auth();
    const s: any = session?.user ?? {};
    const userId: string | undefined = s?.id;
    const email: string | undefined = typeof s?.email === "string" ? s.email : undefined;
    const role: string | undefined = typeof s?.role === "string" ? s.role : undefined;
    const isAdminFlag: boolean = s?.isAdmin === true || role?.toUpperCase?.() === "ADMIN";

    const adminEmails = (process.env["ADMIN_EMAILS"] ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const emailIsAdmin = !!email && adminEmails.includes(email.toLowerCase());
    const isAdmin = isAdminFlag || emailIsAdmin;

    if (!userId && !isAdmin) {
      track("service_delete_unauthorized", { reqId, serviceId });
      return noStore({ error: "Unauthorized" }, { status: 401 });
    }

    // Resolve existing by any id field
    let existing: any = null;
    for (const field of ["id", "serviceId", "service_id", "uid", "uuid", "slug"] as const) {
      try {
        const where = { [field]: serviceId } as any;
        existing = await Service.findUnique({ where, select: { id: true, sellerId: true } });
        if (existing) break;
      } catch {}
    }
    if (!existing) {
      track("service_delete_not_found", { reqId, serviceId, reason: "no_existing" });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    const isOwner = !!userId && existing.sellerId === userId;
    if (!isOwner && !isAdmin) {
      track("service_delete_forbidden", { reqId, serviceId });
      return noStore({ error: "Forbidden" }, { status: 403 });
    }

    await Service.delete({ where: { id: existing.id } });

    try {
      revalidateTag("home:active");
      revalidateTag("services:latest");
      revalidateTag(`service:${existing.id}`);
      if (userId) revalidateTag(`user:${userId}:listings`);
      revalidatePath("/");
      revalidatePath(`/service/${existing.id}`);
      revalidatePath(`/listing/${existing.id}`);
    } catch {}

    track("service_delete_success", { reqId, serviceId: existing.id });
    return noStore({ ok: true });
  } catch (e) {
    console.warn("[services/:id DELETE] error:", e);
    track("service_delete_error", { reqId, message: (e as any)?.message ?? String(e) });
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
