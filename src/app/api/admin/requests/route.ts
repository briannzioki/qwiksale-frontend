// src/app/api/admin/requests/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function isAdminSession(session: any): boolean {
  const v = session as any;
  const role = v?.user?.role ?? v?.role ?? v?.session?.user?.role;
  const isAdminFlag = Boolean(v?.user?.isAdmin ?? v?.isAdmin ?? v?.session?.user?.isAdmin);
  const r = String(role ?? "").toUpperCase();
  return isAdminFlag || r === "ADMIN" || r === "SUPERADMIN";
}

function toInt(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeKind(v: string | null): "product" | "service" | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (s === "product" || s === "service") return s;
  return null;
}

function safeStr(v: string | null, max = 120) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function toIso(v: any) {
  try {
    return v ? new Date(v).toISOString() : null;
  } catch {
    return null;
  }
}

async function readBody(req: Request) {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return (await req.json().catch(() => ({}))) as any;
  }
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return {};
    const out: Record<string, any> = {};
    for (const [k, v] of fd.entries()) out[k] = v;
    return out;
  }
  return {};
}

/**
 * GET /api/admin/requests
 * Admin list/search with full fields. Supports ?id=... for detail.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return noStore({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminSession(session)) return noStore({ error: "Forbidden" }, { status: 403 });

  try {
    const u = new URL(req.url);
    const sp = u.searchParams;

    const id = safeStr(sp.get("id"), 200);
    const now = new Date();

    const requestModel = (prisma as any).request;

    if (id) {
      const r = await requestModel?.findUnique?.({
        where: { id },
        select: {
          id: true,
          kind: true,
          title: true,
          description: true,
          location: true,
          category: true,
          tags: true,
          status: true,
          createdAt: true,
          expiresAt: true,
          boostUntil: true,
          ownerId: true,
          contactEnabled: true,
          contactMode: true,
          owner: {
            select: {
              id: true,
              name: true,
              username: true,
              email: true,
              phone: true,
              whatsapp: true,
              verified: true,
              subscription: true,
              createdAt: true,
              requestBanUntil: true,
              requestBanReason: true,
            },
          },
        },
      });

      if (!r) return noStore({ error: "Not found" }, { status: 404 });

      return noStore({
        ok: true,
        request: {
          ...r,
          createdAt: toIso(r?.createdAt),
          expiresAt: toIso(r?.expiresAt),
          boostUntil: toIso(r?.boostUntil),
          owner: r?.owner
            ? {
                ...r.owner,
                createdAt: toIso((r.owner as any)?.createdAt),
                requestBanUntil: toIso((r.owner as any)?.requestBanUntil),
              }
            : null,
        },
      });
    }

    const q = safeStr(sp.get("q"), 140);
    const kind = safeKind(sp.get("kind"));
    const status = safeStr(sp.get("status"), 60);
    const category = safeStr(sp.get("category"), 80);
    const ownerId = safeStr(sp.get("ownerId"), 200);

    const boostedOnly = (sp.get("boosted") || "").toLowerCase() === "true" || sp.get("boosted") === "1";
    const includeExpired =
      sp.get("includeExpired") == null ? true : sp.get("includeExpired") === "1" || (sp.get("includeExpired") || "").toLowerCase() === "true";

    const page = Math.max(1, toInt(sp.get("page"), 1));
    const pageSize = clamp(toInt(sp.get("pageSize"), 25), 1, 100);

    const where: any = {
      ...(kind ? { kind } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(status ? { status } : {}),
      ...(category ? { category: { contains: category, mode: "insensitive" } } : {}),
      ...(boostedOnly ? { boostUntil: { gt: now } } : {}),
      ...(includeExpired ? {} : { expiresAt: { gt: now } }),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { category: { contains: q, mode: "insensitive" } },
              { location: { contains: q, mode: "insensitive" } },
              { tags: { has: q } },
              { ownerId: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, itemsRaw] = await Promise.all([
      requestModel?.count?.({ where }) ?? 0,
      requestModel?.findMany?.({
        where,
        select: {
          id: true,
          kind: true,
          title: true,
          description: true,
          location: true,
          category: true,
          tags: true,
          status: true,
          createdAt: true,
          expiresAt: true,
          boostUntil: true,
          ownerId: true,
          contactEnabled: true,
          contactMode: true,
        },
        orderBy: [{ boostUntil: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }) ?? [],
    ]);

    const items = (Array.isArray(itemsRaw) ? itemsRaw : []).map((r: any) => ({
      ...r,
      createdAt: toIso(r?.createdAt),
      expiresAt: toIso(r?.expiresAt),
      boostUntil: toIso(r?.boostUntil),
    }));

    return noStore({
      ok: true,
      page,
      pageSize,
      total: Number(total || 0),
      totalPages: Math.max(1, Math.ceil(Number(total || 0) / pageSize)),
      items,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/admin/requests GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/requests
 * Admin actions (currently: close)
 * Body supports JSON or formData: { action: "close", id }
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return noStore({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminSession(session)) return noStore({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await readBody(req);
    const action = String(body?.action || "").trim().toLowerCase();
    const id = String(body?.id || "").trim();

    if (!action) return noStore({ error: "Missing action" }, { status: 400 });
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    const requestModel = (prisma as any).request;

    if (action === "close") {
      const updated = await requestModel?.update?.({
        where: { id },
        data: { status: "CLOSED" },
        select: { id: true, status: true },
      });

      return noStore({ ok: true, request: updated ?? { id, status: "CLOSED" } });
    }

    return noStore({ error: "Unsupported action" }, { status: 400 });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/admin/requests POST] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
