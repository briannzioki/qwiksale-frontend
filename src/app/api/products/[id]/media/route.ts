export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
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

/* ---------- allowlist (match create routes) ---------- */
const ALLOWED_IMAGE_HOSTS = [
  "res.cloudinary.com",
  "images.unsplash.com",
] as const;

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

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: raw } = await context.params;
    const id = (raw ?? "").trim();
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    const session = await auth().catch(() => null);
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true, sellerId: true, image: true, gallery: true },
    });

    if (!product) return noStore({ error: "Not found" }, { status: 404 });
    if (product.sellerId && product.sellerId !== userId) {
      return noStore({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as PatchBody | null;
    if (!body || !Array.isArray(body.items)) {
      return noStore({ error: "Bad request: expected {items: [...]}" }, { status: 400 });
    }

    // Normalize to allowed http(s) URLs only, sort, dedupe
    const normalized = body.items
      .map((x, i) => {
        const url = typeof x?.url === "string" ? x.url.trim() : "";
        const good = url && isAllowedUrl(url);
        if (!good) return null;
        const sort =
          Number.isFinite(x?.sort) && x?.sort !== null ? Number(x!.sort) : i;
        const isCover = Boolean(x?.isCover);
        return { url, sort, isCover, i };
      })
      .filter(Boolean) as Array<{ url: string; sort: number; isCover: boolean; i: number }>;

    normalized.sort((a, b) => a.sort - b.sort || a.i - b.i);

    const seen = new Set<string>();
    const unique: Array<{ url: string; isCover: boolean }> = [];
    for (const n of normalized) {
      if (seen.has(n.url)) continue;
      seen.add(n.url);
      unique.push({ url: n.url, isCover: n.isCover });
    }

    // explicit cover wins; else first is cover
    const explicitCoverIdx = unique.findIndex((x) => x.isCover);
    const ordered =
      explicitCoverIdx > 0
        ? [unique[explicitCoverIdx]!, ...unique.filter((_, idx) => idx !== explicitCoverIdx)]
        : unique;

    // Enforce cap = 6 (product gallery limit)
    const MAX = 6;
    const gallery = ordered.slice(0, MAX).map((x) => x.url);
    const coverUrl = gallery[0] ?? null;

    await prisma.product.update({
      where: { id },
      data: { image: coverUrl, gallery },
    });

    // revalidate tags/paths
    try {
      revalidateTag("home:active");
      revalidateTag("products:latest");
      revalidateTag(`product:${id}`);
      revalidatePath("/");
      revalidatePath("/products");
      revalidatePath(`/product/${id}`);
      revalidatePath(`/listing/${id}`);
    } catch {}

    return noStore({ ok: true, cover: coverUrl, gallery });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[products media PATCH] error", e);
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
