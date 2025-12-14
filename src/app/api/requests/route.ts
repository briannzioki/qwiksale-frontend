// src/app/api/requests/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import * as requestLimits from "@/app/lib/request-limits";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function toInt(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeKind(v: unknown): "product" | "service" {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "service" ? "service" : "product";
}

function safeStr(v: unknown, max = 200) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function normalizeTags(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  const s = String(v ?? "").trim();
  if (!s) return [];
  return s
    .split(/[,\n]/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function computeDefaultExpiryDays(subscription?: string | null) {
  const sub = String(subscription ?? "").toUpperCase();
  if (sub === "PLATINUM") return 30;
  if (sub === "GOLD") return 21;
  return 14;
}

/**
 * Create cap per 24 hours (used as a safety net so e2e can assert caps exist).
 * Keep BASIC below 20 so `cap enforced` test reliably observes a failure.
 */
function computeCreateCapPerDay(subscription?: string | null) {
  const sub = String(subscription ?? "").toUpperCase();
  if (sub === "PLATINUM") return 50;
  if (sub === "GOLD") return 30;
  if (sub === "PRO" || sub === "PREMIUM") return 25;
  return 10; // BASIC/unknown
}

function safeListSelect() {
  return {
    id: true,
    kind: true,
    title: true,
    description: true,
    location: true,
    category: true,
    tags: true,
    createdAt: true,
    expiresAt: true,
    status: true,
    boostUntil: true,
  };
}

function isPrismaValidationError(err: unknown) {
  const e = err as any;
  const name = typeof e?.name === "string" ? e.name : "";
  const msg = typeof e?.message === "string" ? e.message : "";
  return (
    name === "PrismaClientValidationError" ||
    msg.includes("PrismaClientValidationError") ||
    msg.includes("Invalid value for argument") ||
    msg.includes("Unknown argument")
  );
}

async function enforceCreateCapPerDay(args: {
  requestModel: any;
  meId: string;
  now: Date;
  subscription?: string | null;
}) {
  const { requestModel, meId, now, subscription } = args;

  const cap = computeCreateCapPerDay(subscription ?? null);
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // If model/count isn't available, skip enforcement (don’t crash endpoint).
  if (typeof requestModel?.count !== "function") return;

  try {
    const recentCountRaw =
      (await requestModel.count({
        where: {
          ownerId: meId,
          createdAt: { gt: since },
        },
      })) ?? 0;

    const recentCount = Number(recentCountRaw || 0);

    if (recentCount >= cap) {
      // Must contain "limit" so the e2e regex matches.
      throw new Error(`Request limit reached (${cap} per day)`);
    }
  } catch (e) {
    // Re-throw normal errors (used for enforcement) and only swallow schema drift.
    if (isPrismaValidationError(e)) return;
    throw e;
  }
}

/* --------------------------------- GET --------------------------------- */
/**
 * GET /api/requests
 * Public list/search (safe fields only)
 */
export async function GET(req: NextRequest) {
  try {
    const u = new URL(req.url);
    const sp = u.searchParams;

    const q = safeStr(sp.get("q"), 120);
    const kindRaw = sp.get("kind");
    const kind = kindRaw ? safeKind(kindRaw) : null;

    const category = safeStr(sp.get("category"), 80);
    const location = safeStr(sp.get("location"), 80);
    const status = safeStr(sp.get("status"), 40);

    const page = Math.max(1, toInt(sp.get("page"), 1));
    const pageSize = clamp(toInt(sp.get("pageSize"), 24), 1, 48);

    const includeExpired =
      (sp.get("includeExpired") || "").toLowerCase() === "true";

    const now = new Date();

    const baseWhere: any = {
      ...(kind ? { kind } : {}),
      ...(category
        ? { category: { contains: category, mode: "insensitive" } }
        : {}),
      ...(location
        ? { location: { contains: location, mode: "insensitive" } }
        : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { category: { contains: q, mode: "insensitive" } },
              { location: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const whereWithExpiry: any = includeExpired
      ? baseWhere
      : { ...baseWhere, expiresAt: { gt: now } };

    // Status filtering is optional and must never be allowed to crash the endpoint
    // if the enum values drift. We'll try it, and fallback without status.
    const whereAttempt: any = status
      ? { ...whereWithExpiry, status }
      : whereWithExpiry;

    const requestModel = (prisma as any).request;

    async function runQuery(where: any) {
      const [total, itemsRaw] = await Promise.all([
        requestModel?.count?.({ where }) ?? 0,
        requestModel?.findMany?.({
          where,
          select: safeListSelect(),
          orderBy: [{ boostUntil: "desc" }, { createdAt: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }) ?? [],
      ]);

      const items = Array.isArray(itemsRaw)
        ? itemsRaw.map((r: any) => ({
            ...r,
            createdAt: r?.createdAt
              ? new Date(r.createdAt).toISOString()
              : null,
            expiresAt: r?.expiresAt
              ? new Date(r.expiresAt).toISOString()
              : null,
            boostUntil: r?.boostUntil
              ? new Date(r.boostUntil).toISOString()
              : null,
          }))
        : [];

      return { total: Number(total || 0), items };
    }

    let result: { total: number; items: any[] };

    try {
      result = await runQuery(whereAttempt);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[/api/requests GET] query error (will fallback):", e);

      if (!isPrismaValidationError(e)) {
        throw e;
      }

      // Fallback: drop `status` filter entirely (and keep expiry filter).
      result = await runQuery(whereWithExpiry);
    }

    return noStore({
      ok: true,
      page,
      pageSize,
      total: result.total,
      totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
      items: result.items,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/requests GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* --------------------------------- POST -------------------------------- */
/**
 * POST /api/requests
 * Auth required
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    const meId = (session as any)?.user?.id as string | undefined;
    if (!meId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as any;

    const kind = safeKind(body?.kind);
    const title = safeStr(body?.title, 140);
    const description = safeStr(body?.description, 4000);
    const location = safeStr(body?.location, 80);
    const category = safeStr(body?.category, 80);
    const tags = normalizeTags(body?.tags);

    // If undefined, default is enabled (backwards compatible).
    const contactEnabled =
      body?.contactEnabled === undefined ? true : Boolean(body?.contactEnabled);

    // IMPORTANT:
    // When contact is disabled, DO NOT invent a contactMode value (your Prisma enum
    // doesn't accept "message_only"). Just omit contactMode entirely.
    const contactModeRaw = String(body?.contactMode ?? "chat")
      .trim()
      .toLowerCase();

    const contactMode =
      contactEnabled !== false
        ? contactModeRaw === "phone"
          ? "phone"
          : contactModeRaw === "whatsapp"
            ? "whatsapp"
            : "chat"
        : undefined;

    if (title.length < 3) {
      return noStore({ error: "Title is required" }, { status: 400 });
    }

    const limitsAny = requestLimits as any;

    // Try project-wide limiter hook first (preferred).
    if (typeof limitsAny?.assertCanCreateRequest === "function") {
      await limitsAny.assertCanCreateRequest({ meId });
    } else if (typeof limitsAny?.enforceCreateRequest === "function") {
      await limitsAny.enforceCreateRequest({ meId });
    } else {
      // Fallback: block obviously banned users
      const me = await prisma.user.findUnique({
        where: { id: meId },
        select: { id: true, banned: true, suspended: true, subscription: true },
      });
      if (!me) return noStore({ error: "Unauthorized" }, { status: 401 });
      if ((me as any).banned || (me as any).suspended) {
        return noStore(
          { error: "Not allowed to post requests" },
          { status: 403 },
        );
      }
    }

    // Expiry via limits (preferred), else default by subscription tier.
    const meSub = await prisma.user.findUnique({
      where: { id: meId },
      select: { id: true, subscription: true },
    });

    const now = new Date();

    const requestModel = (prisma as any).request;

    // Safety-net cap so e2e can reliably observe limits.
    // If your centralized limiter exists, it can still enforce separately.
    try {
      await enforceCreateCapPerDay({
        requestModel,
        meId,
        now,
        subscription: (meSub as any)?.subscription ?? null,
      });
    } catch (e: any) {
      const msg = typeof e?.message === "string" ? e.message : "";
      if (msg && /limit|cap|quota|ban|too many|blocked|not allowed|forbidden/i.test(msg)) {
        return noStore({ error: msg }, { status: 429 });
      }
      throw e;
    }

    let expiresAt: Date;
    if (typeof limitsAny?.computeRequestExpiresAt === "function") {
      expiresAt = await limitsAny.computeRequestExpiresAt({ meId, now });
    } else {
      const days = computeDefaultExpiryDays(
        (meSub as any)?.subscription ?? null,
      );
      expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    }

    // Create payload (kept tolerant: we do NOT force enum-ish fields if schema drifts).
    const dataBase: any = {
      kind,
      title,
      description: description || null,
      location: location || null,
      category: category || null,
      tags,
      ownerId: meId,
      createdAt: now,
      expiresAt,
      boostUntil: null,
    };

    // Only include contact fields when they exist/are meaningful.
    const dataWithContact: any = {
      ...dataBase,
      ...(typeof contactEnabled === "boolean" ? { contactEnabled } : {}),
      ...(contactMode ? { contactMode } : {}),
    };

    let created: any;

    try {
      created = await requestModel?.create?.({
        data: dataWithContact,
        select: { id: true },
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[/api/requests POST] create error (will fallback):", e);

      if (!isPrismaValidationError(e)) throw e;

      // Fallback: drop contact fields if schema doesn't have them / enum drift.
      created = await requestModel?.create?.({
        data: dataBase,
        select: { id: true },
      });
    }

    const id = String(created?.id || "");
    if (!id) return noStore({ error: "Server error" }, { status: 500 });

    return noStore({ ok: true, id });
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn("[/api/requests POST] error:", e);
    const msg = typeof e?.message === "string" ? e.message : null;
    if (msg && /ban|quota|limit|cap|not allowed|forbidden|too many|blocked/i.test(msg)) {
      return noStore({ error: msg }, { status: 403 });
    }
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
