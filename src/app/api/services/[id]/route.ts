// src/app/api/services/[id]/route.ts
export const preferredRegion = "fra1";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { revalidatePath, revalidateTag } from "next/cache";

/* ------------------------- helpers ------------------------- */
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

/** Safe extractor: /api/services/:id */
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

const RATE_TYPES = new Set(["hour", "day", "fixed"]);

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

/* --------------------------- shape/select --------------------------- */
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

function shape(row: any) {
  return {
    ...row,
    createdAt:
      row?.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row?.createdAt ?? ""),
  };
}

/** Use an `any` alias so routes keep compiling even if Prisma model isn’t generated yet. */
const db: any = prisma;

/* ------------------------------ GET ------------------------------ */
export async function GET(req: NextRequest) {
  try {
    const id = getId(req);
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    const session = await auth().catch(() => null);
    const uid = (session?.user as any)?.id as string | undefined;

    // public ACTIVE first
    const active = await db.service.findFirst({
      where: { id, status: "ACTIVE" },
      select: selectBase,
    });
    if (active) return noStore(shape(active));

    // owner fallback
    if (!uid) return noStore({ error: "Not found" }, { status: 404 });
    const owner = await db.service.findFirst({
      where: { id, sellerId: uid },
      select: selectBase,
    });
    if (!owner) return noStore({ error: "Not found" }, { status: 404 });
    return noStore(shape(owner));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[services/:id GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* ----------------------------- PATCH ----------------------------- */
export async function PATCH(req: NextRequest) {
  try {
    const id = getId(req);
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    // Content-Type check (parity with products)
    const ctype = req.headers.get("content-type") || "";
    if (!ctype.toLowerCase().includes("application/json")) {
      return noStore({ error: "Content-Type must be application/json" }, { status: 415 });
    }

    const session = await auth().catch(() => null);
    const uid = (session?.user as any)?.id as string | undefined;
    if (!uid) return noStore({ error: "Unauthorized" }, { status: 401 });

    const svc = await db.service.findUnique({ where: { id }, select: { sellerId: true } });
    if (!svc || svc.sellerId !== uid) {
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
      status: s(body.status), // allow owner to set HIDDEN / ACTIVE / DRAFT / SOLD
      featured: typeof body.featured === "boolean" ? Boolean(body.featured) : undefined,
    };

    // validate specific fields if provided
    if (patch.rateType && !RATE_TYPES.has(patch.rateType)) {
      return noStore({ error: "Invalid rateType" }, { status: 400 });
    }
    if (patch.price === undefined && "price" in body) {
      return noStore({ error: "Invalid price" }, { status: 400 });
    }
    if (patch.status && !["ACTIVE", "HIDDEN", "DRAFT", "SOLD"].includes(patch.status)) {
      return noStore({ error: "Invalid status" }, { status: 400 });
    }

    // build Prisma update data by omitting undefined
    const data: Record<string, any> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) data[k] = v;
    }

    const updated = await db.service.update({
      where: { id },
      data,
      select: selectBase,
    });

    // ---- revalidate caches after update (parity with products) ----
    try {
      revalidateTag("home:active");
      revalidateTag("services:latest");
      revalidateTag(`service:${id}`);
      revalidateTag(`user:${uid}:services`);
      revalidatePath("/");
      revalidatePath(`/service/${id}`);
    } catch {
      /* best-effort */
    }

    return noStore(shape(updated));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[services/:id PATCH] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* ---------------------------- DELETE ---------------------------- */
/** Soft-delete: mark as HIDDEN (parity with public filtering).
 *  Owner OR Admin may perform this action.
 */
export async function DELETE(req: NextRequest) {
  try {
    const id = getId(req);
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    const session = await auth().catch(() => null);
    const s: any = session?.user ?? {};
    const uid: string | undefined = s?.id;
    const email: string | undefined = typeof s?.email === "string" ? s.email : undefined;
    const role: string | undefined = typeof s?.role === "string" ? s.role : undefined;
    const isAdminFlag: boolean = s?.isAdmin === true || (role?.toUpperCase?.() === "ADMIN");

    // Admin allow-list via env (same pattern as products route)
    const adminEmails = (process.env['ADMIN_EMAILS'] ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const emailIsAdmin = !!email && adminEmails.includes(email.toLowerCase());

    const isAdmin = isAdminFlag || emailIsAdmin;

    if (!uid && !isAdmin) return noStore({ error: "Unauthorized" }, { status: 401 });

    const svc = await db.service.findUnique({
      where: { id },
      select: { sellerId: true, status: true },
    });
    if (!svc) return noStore({ error: "Not found" }, { status: 404 });

    const isOwner = !!uid && svc.sellerId === uid;
    if (!isOwner && !isAdmin) return noStore({ error: "Forbidden" }, { status: 403 });

    // Soft delete (leave hard-deletes to DB maintenance scripts)
    await db.service.update({
      where: { id },
      data: { status: "HIDDEN", featured: false },
    });

    // ---- revalidate caches after delete ----
    try {
      revalidateTag("home:active");
      revalidateTag("services:latest");
      revalidateTag(`service:${id}`);
      if (uid) revalidateTag(`user:${uid}:services`);
      revalidatePath("/");
      revalidatePath(`/service/${id}`);
    } catch {
      /* best-effort */
    }

    return noStore({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[services/:id DELETE] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* ----------------------------- CORS ----------------------------- */
export function OPTIONS() {
  const origin =
    process.env["NEXT_PUBLIC_APP_URL"] ??
    process.env["NEXT_PUBLIC_APP_URL"] ??
    "*";

  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Methods", "GET, PATCH, DELETE, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
