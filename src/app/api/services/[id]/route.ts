// src/app/api/services/[id]/route.ts
export const preferredRegion = "fra1";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getViewer } from "@/app/lib/auth";
import { revalidatePath, revalidateTag } from "next/cache";

/* ---------------- analytics (console-only for now) ---------------- */
type AnalyticsEvent =
  | "service_read_attempt"
  | "service_read_public_hit"
  | "service_read_owner_hit"
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
    // eslint-disable-next-line no-console
    console.log(`[track] ${event}`, { ts: new Date().toISOString(), ...props });
  } catch {
    /* no-op */
  }
}

/* ------------------------- helpers ------------------------- */
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
    const idx = segs.findIndex((s) => s === "services");
    const next = idx >= 0 ? segs[idx + 1] : "";
    return String(next ?? "").trim();
  } catch {
    return "";
  }
}

// tolerant rate types & status values
const RATE_TYPES = new Set(["hour", "day", "fixed"]);
const STATUS_VALUES = new Set(["ACTIVE", "HIDDEN", "DRAFT", "SOLD"]);

function s(v: unknown) {
  const t = typeof v === "string" ? v : v == null ? "" : String(v);
  const out = t.trim();
  return out.length ? out : undefined;
}
function n(v: unknown): number | null | undefined {
  if (v === "" || v == null) return null;
  const num = Number(v);
  return Number.isFinite(num) ? Math.max(0, Math.round(num)) : undefined;
}
function arr(v: unknown): string[] | undefined {
  if (!v) return undefined;
  if (Array.isArray(v)) return v.map(String).map((x) => x.trim()).filter(Boolean).slice(0, 12);
  if (typeof v === "string") return [v.trim()].filter(Boolean);
  return undefined;
}
function clip(str: string | undefined, max = 2000) {
  if (!str) return str;
  return str.length <= max ? str : str.slice(0, max);
}

/** Tolerate schema/model naming drift */
function getServiceModel() {
  const any = prisma as any;
  const svc =
    any.service ??
    any.services ??
    any.Service ??
    any.Services ??
    null;
  return svc && typeof svc.findUnique === "function" ? svc : null;
}

/** stable select for service (safe fields) */
const selectBase = {
  id: true,
  name: true,
  description: true,
  category: true,
  subcategory: true,
  image: true,
  gallery: true,
  price: true,
  rateType: true,
  serviceArea: true,
  availability: true,
  location: true,
  featured: true,
  createdAt: true,
  status: true,

  sellerId: true,
  sellerName: true,
  sellerLocation: true,
  sellerMemberSince: true,
  sellerRating: true,
  sellerSales: true,
  sellerPhone: true, // will be redacted for public viewers

  seller: {
    select: {
      id: true,
      name: true,
      image: true,
      username: true,
      subscription: true,
    },
  },
} as const;

/** shape/normalize response */
function shape(row: any, includePrivate = false) {
  const out: any = {
    ...row,
    createdAt:
      row?.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row?.createdAt ?? ""),
  };

  if (!includePrivate && "sellerPhone" in out) out.sellerPhone = null;

  if (Array.isArray(out.gallery)) {
    out.gallery = out.gallery.map((u: any) => String(u || "").trim()).filter(Boolean);
  }

  return out;
}

/* ------------------------------ GET ------------------------------ */
export async function GET(req: NextRequest) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  try {
    const id = getId(req);
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    track("service_read_attempt", { reqId, id });

    const Service = getServiceModel();
    if (!Service) return noStore({ error: "Service model not found" }, { status: 500 });

    const row = await Service.findUnique({
      where: { id },
      select: selectBase,
    });

    if (!row) {
      track("service_read_not_found", { reqId, id, reason: "no_row" });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    if (row.status === "ACTIVE") {
      track("service_read_public_hit", { reqId, id });
      return noStore(shape(row, /* includePrivate */ false));
    }

    // Owner/Admin may view non-ACTIVE
    const viewer = await getViewer();
    const isOwner = !!viewer.id && row.sellerId === viewer.id;
    if (isOwner || viewer.isAdmin) {
      track("service_read_owner_hit", { reqId, id });
      return noStore(shape(row, /* includePrivate */ true));
    }

    track("service_read_not_found", { reqId, id, reason: "not_public_and_not_owner" });
    return noStore({ error: "Not found" }, { status: 404 });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[services/:id GET] error:", e);
    track("service_read_error", { message: (e as any)?.message });
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* ----------------------------- PATCH ----------------------------- */
export async function PATCH(req: NextRequest) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  try {
    const id = getId(req);
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    track("service_update_attempt", { reqId, id });

    const ctype = req.headers.get("content-type") || "";
    if (!ctype.toLowerCase().includes("application/json")) {
      return noStore({ error: "Content-Type must be application/json" }, { status: 415 });
    }

    const Service = getServiceModel();
    if (!Service) return noStore({ error: "Service model not found" }, { status: 500 });

    const viewer = await getViewer();
    if (!viewer.id && !viewer.isAdmin) {
      track("service_update_unauthorized", { reqId, id });
      return noStore({ error: "Unauthorized" }, { status: 401 });
    }

    const svc = await Service.findUnique({ where: { id }, select: { sellerId: true } });
    if (!svc) {
      track("service_update_not_found", { reqId, id, reason: "no_existing" });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    const isOwner = !!viewer.id && svc.sellerId === viewer.id;
    if (!isOwner && !viewer.isAdmin) {
      track("service_update_forbidden", { reqId, id });
      return noStore({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const patch = {
      name: s(body.name),
      description: clip(s(body.description), 5000),
      category: s(body.category),
      subcategory: s(body.subcategory),
      price: n(body.price),
      rateType: s(body.rateType),
      serviceArea: s(body.serviceArea),
      availability: s(body.availability),
      image: s(body.image),
      gallery: arr(body.gallery),
      location: s(body.location),
      status: s(body.status),
      featured: typeof body.featured === "boolean" ? Boolean(body.featured) : undefined,
    };

    if (patch.rateType && !RATE_TYPES.has(patch.rateType)) {
      return noStore({ error: "Invalid rateType" }, { status: 400 });
    }
    if (patch.price === undefined && "price" in body) {
      return noStore({ error: "Invalid price" }, { status: 400 });
    }
    if (patch.status && !STATUS_VALUES.has(patch.status)) {
      return noStore({ error: "Invalid status" }, { status: 400 });
    }

    const data: Record<string, any> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) data[k] = v;
    }

    const updated = await Service.update({
      where: { id },
      data,
      select: selectBase,
    });

    try {
      revalidateTag("home:active");
      revalidateTag("services:latest");
      revalidateTag(`service:${id}`);
      if (viewer.id) revalidateTag(`user:${viewer.id}:services`);
      revalidatePath("/");
      revalidatePath(`/service/${id}`);
      revalidatePath(`/dashboard`);
    } catch {
      /* best-effort */
    }

    track("service_update_success", { reqId, id });
    return noStore(shape(updated, /* includePrivate */ true));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[services/:id PATCH] error:", e);
    track("service_update_error", { message: (e as any)?.message });
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* ---------------------------- DELETE ---------------------------- */
export async function DELETE(req: NextRequest) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  try {
    const id = getId(req);
    if (!id) {
      track("service_delete_not_found", { reqId, reason: "missing_id" });
      return noStore({ error: "Missing id" }, { status: 400 });
    }

    track("service_delete_attempt", { reqId, id });

    const Service = getServiceModel();
    if (!Service) return noStore({ error: "Service model not found" }, { status: 500 });

    const viewer = await getViewer();
    if (!viewer.id && !viewer.isAdmin) {
      track("service_delete_unauthorized", { reqId, id });
      return noStore({ error: "Unauthorized" }, { status: 401 });
    }

    const svc = await Service.findUnique({
      where: { id },
      select: { sellerId: true, status: true },
    });
    if (!svc) {
      track("service_delete_not_found", { reqId, id, reason: "no_existing" });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    const isOwner = !!viewer.id && svc.sellerId === viewer.id;
    if (!isOwner && !viewer.isAdmin) {
      track("service_delete_forbidden", { reqId, id });
      return noStore({ error: "Forbidden" }, { status: 403 });
    }

    // Prefer soft-delete; if schema doesn't support 'status', fall back to hard-delete
    let softDeleted = false;
    try {
      await Service.update({ where: { id }, data: { status: "HIDDEN", featured: false } });
      softDeleted = true;
    } catch {
      /* ignore and hard-delete below */
    }
    if (!softDeleted) {
      await Service.delete({ where: { id } });
    }

    try {
      revalidateTag("home:active");
      revalidateTag("services:latest");
      revalidateTag(`service:${id}`);
      if (viewer.id) revalidateTag(`user:${viewer.id}:services`);
      revalidatePath("/");
      revalidatePath(`/service/${id}`);
      revalidatePath(`/dashboard`);
    } catch {
      /* best-effort */
    }

    track("service_delete_success", { reqId, id, mode: softDeleted ? "soft" : "hard" });
    return noStore({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[services/:id DELETE] error:", e);
    track("service_delete_error", { message: (e as any)?.message });
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* ----------------------------- CORS ----------------------------- */
export function OPTIONS() {
  const origin =
    process.env["NEXT_PUBLIC_APP_URL"] ??
    process.env["APP_ORIGIN"] ??
    "*";

  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Methods", "GET, PATCH, DELETE, OPTIONS, HEAD");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
