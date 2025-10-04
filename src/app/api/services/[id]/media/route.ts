// src/app/api/services/[id]/media/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

type PatchBody = {
  items?: Array<{ id?: string; url?: string; isCover?: boolean; sort?: number | null | undefined }>;
};

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding, Origin");
  return res;
}

// schema-tolerant accessor in case the model name is different
function getServiceModel() {
  const anyPrisma = prisma as any;
  const svc =
    anyPrisma.service ??
    anyPrisma.services ??
    anyPrisma.Service ??
    anyPrisma.Services ??
    null;
  return svc && typeof svc.findUnique === "function" ? svc : null;
}

// allow http(s), protocol-relative, same-origin paths, blob:, and image data: URLs
function sanitizeUrl(u?: string | null): string | null {
  const t = (u ?? "").trim();
  if (!t) return null;
  if (t.length > 2048) return null;
  const lower = t.toLowerCase();
  if (lower.startsWith("javascript:")) return null;
  if (lower.startsWith("data:")) {
    if (/^data:image\/(png|jpeg|jpg|gif|webp|bmp|svg\+xml);base64,/i.test(lower)) return t;
    return null;
  }
  if (lower.startsWith("blob:")) return t;
  if (lower.startsWith("http://") || lower.startsWith("https://")) return t;
  if (lower.startsWith("//")) return t;
  if (t.startsWith("/")) return t;
  return null;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    let id = "";
    try {
      id = ((await context.params)?.id ?? "").trim();
    } catch {
      id = "";
    }
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    const session = await auth().catch(() => null);
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const Service = getServiceModel();
    if (!Service) return noStore({ error: "Service model not available" }, { status: 500 });

    const svc = await Service.findUnique({
      where: { id },
      select: { id: true, sellerId: true, image: true, gallery: true },
    });

    if (!svc) return noStore({ error: "Not found" }, { status: 404 });
    if (svc.sellerId && svc.sellerId !== userId) {
      return noStore({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as PatchBody | null;
    if (!body || !Array.isArray(body.items)) {
      return noStore({ error: "Bad request: expected {items: [...]}" }, { status: 400 });
    }

    // Normalize, sort by provided sort (default to stable index), sanitize URL, drop empties
    const normalized = body.items
      .map((x, i) => {
        const url = sanitizeUrl(x?.url ?? null);
        const sort = Number.isFinite(x?.sort) && x?.sort !== null ? Number(x!.sort) : i;
        const isCover = Boolean(x?.isCover);
        return url ? { url, sort, isCover, i } : null;
      })
      .filter(Boolean) as Array<{ url: string; sort: number; isCover: boolean; i: number }>;

    // Sort and de-duplicate by URL, preserving first occurrence
    normalized.sort((a, b) => a.sort - b.sort || a.i - b.i);
    const seen = new Set<string>();
    const unique: Array<{ url: string; isCover: boolean }> = [];
    for (const n of normalized) {
      if (seen.has(n.url)) continue;
      seen.add(n.url);
      unique.push({ url: n.url, isCover: n.isCover });
    }

    // Respect explicit cover flag; otherwise first item is cover
    const explicitCoverIdx = unique.findIndex((x) => x.isCover);
    const ordered =
      explicitCoverIdx > 0
        ? [unique[explicitCoverIdx]!, ...unique.filter((_, idx) => idx !== explicitCoverIdx)]
        : unique;

    // Cap gallery length
    const MAX = 24;
    const gallery = ordered.slice(0, MAX).map((x) => x.url);
    const coverUrl = gallery[0] ?? null;

    await Service.update({
      where: { id },
      data: { image: coverUrl, gallery },
    });

    return noStore({ ok: true, cover: coverUrl, gallery });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[services media PATCH] error", e);
    return noStore({ error: "Failed" }, { status: 500 });
  }
}

export function OPTIONS() {
  const origin =
    process.env["NEXT_PUBLIC_APP_URL"] ??
    process.env["APP_ORIGIN"] ??
    "*";
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Methods", "PATCH, OPTIONS, HEAD");
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
