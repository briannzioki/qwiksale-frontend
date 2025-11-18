// src/app/api/services/[id]/media/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

type PatchBody = {
  items?: Array<{
    id?: string;
    url?: string;
    isCover?: boolean;
    sort?: number | null | undefined;
  }>;
};

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding, Origin");
  return res;
}

// schema-tolerant accessor in case the model name differs
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

/* ---------- Allowlist (configurable; matches create routes) ---------- */
const RAW_HOSTS =
  process.env["NEXT_PUBLIC_IMAGE_HOSTS"] ||
  "res.cloudinary.com,images.unsplash.com";

const ALLOW_ANY_HTTPS =
  process.env["NEXT_PUBLIC_IMAGE_ALLOW_ANY_HTTPS"] === "1" ||
  process.env["NEXT_PUBLIC_IMAGE_ALLOW_ANY_HTTPS"] === "true";

const EXTRA_BASES = [
  process.env["AWS_S3_PUBLIC_URL"] || "",
  process.env["NEXT_PUBLIC_CDN_BASE"] || "",
  process.env["R2_PUBLIC_URL"] || process.env["CLOUDFLARE_R2_PUBLIC_URL"] || "",
].filter(Boolean);

const EXTRA_HOSTS: string[] = [];
for (const base of EXTRA_BASES) {
  try {
    const u = new URL(base);
    if (u.hostname) EXTRA_HOSTS.push(u.hostname);
  } catch {
    // ignore invalid URL
  }
}

const ALLOWED_IMAGE_HOSTS: readonly string[] = [
  ...RAW_HOSTS.split(",").map((s) => s.trim()).filter(Boolean),
  ...EXTRA_HOSTS,
];

function isAllowedHost(hostname: string): boolean {
  if (ALLOW_ANY_HTTPS) return true;
  return ALLOWED_IMAGE_HOSTS.some(
    (h) => hostname === h || hostname.endsWith(`.${h}`)
  );
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

const MAX_GALLERY =
  Math.max(1, Number(process.env["NEXT_PUBLIC_GALLERY_MAX"] || "6")) || 6;

export async function PATCH(
  req: NextRequest,
  // Keep params as Promise to satisfy Next ParamCheck in app router
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: raw } = await context.params;
    const id = (raw ?? "").trim();
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    const session = await auth().catch(() => null);
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const Service = getServiceModel();
    if (!Service) {
      return noStore({ error: "Service model not available" }, { status: 500 });
    }

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
      return noStore(
        { error: "Bad request: expected {items: [...]}" },
        { status: 400 }
      );
    }

    // Normalize HTTP(S) only, filter by allowed hosts, sort + dedupe by URL.
    const prepared = body.items
      .map((x, i) => {
        const url = typeof x?.url === "string" ? x.url.trim() : "";
        if (!url || !isAllowedUrl(url)) return null;
        const sort =
          Number.isFinite(x?.sort) && x?.sort !== null ? Number(x!.sort) : i;
        const isCover = !!x?.isCover;
        return { url, sort, isCover, i };
      })
      .filter(Boolean) as Array<{
      url: string;
      sort: number;
      isCover: boolean;
      i: number;
    }>;

    // Order by (sort, original index) and dedupe by URL
    prepared.sort((a, b) => a.sort - b.sort || a.i - b.i);

    const seen = new Set<string>();
    const unique: Array<{ url: string; isCover: boolean }> = [];
    for (const it of prepared) {
      if (seen.has(it.url)) continue;
      seen.add(it.url);
      unique.push({ url: it.url, isCover: it.isCover });
    }

    // Ensure a single cover: explicit cover wins; else first.
    const explicitCoverIdx = unique.findIndex((x) => x.isCover);
    const ordered =
      explicitCoverIdx > 0
        ? [
            unique[explicitCoverIdx]!,
            ...unique.filter((_, idx) => idx !== explicitCoverIdx),
          ]
        : unique;

    const gallery = ordered.slice(0, MAX_GALLERY).map((x) => x.url);
    const coverUrl = gallery[0] ?? null;

    await Service.update({
      where: { id },
      data: { image: coverUrl, gallery },
    });

    // Revalidate tags/paths (best-effort)
    try {
      revalidateTag("home:active");
      revalidateTag("services:latest");
      revalidateTag(`service:${id}`);
      revalidatePath("/");
      revalidatePath("/services");
      revalidatePath(`/service/${id}`);
      revalidatePath(`/service/${id}/edit`);
      revalidatePath(`/service-listing/${id}`);
      revalidatePath(`/dashboard`);
    } catch {
      // ignore
    }

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
