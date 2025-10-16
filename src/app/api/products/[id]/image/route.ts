// src/app/api/products/[id]/image/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import {
  uploadFromFile,
  deleteByPublicId,
  publicIdFromUrl,
} from "../../../../lib/upload";

/* ------------------------- helpers ------------------------- */
function looksLikeUrl(x?: string | null) {
  const s = (x || "").trim();
  return !!s && (/^https?:\/\//i.test(s) || s.includes("res.cloudinary.com/"));
}

function decodeMaybe(s: string | null): string {
  if (!s) return "";
  const t = s.trim();
  try {
    return decodeURIComponent(t);
  } catch {
    return t;
  }
}

function pickUrlish(obj: any): string | null {
  if (!obj || typeof obj !== "object") return null;
  const cand =
    obj.url ??
    obj.secure_url ??
    obj.secureUrl ??
    obj.href ??
    obj.src ??
    obj.path ??
    obj.location ??
    null;

  if (typeof cand === "string" && cand.trim()) return cand.trim();

  // Some older clients sent { id: "<https url>" }
  if (typeof obj.id === "string" && looksLikeUrl(obj.id)) return obj.id.trim();

  return null;
}

function pickPublicIdish(obj: any): string | null {
  if (!obj || typeof obj !== "object") return null;
  const cand = obj.publicId ?? obj.public_id ?? obj.id ?? null;
  return typeof cand === "string" && cand.trim() ? cand.trim() : null;
}

/* ------------------------------ POST (add) ------------------------------ */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing product id" }, { status: 400 });

  // auth + owner/admin
  let session: any = null;
  try { session = await auth(); } catch {}
  const userId = session?.user?.id as string | undefined;
  const isAdmin = !!session?.user?.isAdmin;

  const product = await (prisma as any).product.findUnique({
    where: { id },
    select: { id: true, sellerId: true, image: true, gallery: true },
  }).catch(() => null);

  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  if (!userId || (!isAdmin && product.sellerId !== userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const makeCover =
    String(new URL(req.url).searchParams.get("cover") || "").toLowerCase() === "true";
  const ctype = req.headers.get("content-type") || "";

  let urlFromBody: string | null = null;
  let uploadedPublicId: string | undefined;

  try {
    if (ctype.includes("multipart/form-data")) {
      const fd = await req.formData();
      const file = fd.get("file");
      const directUrl = decodeMaybe((fd.get("url") as string | null) || (fd.get("id") as string | null));

      if (file && file instanceof File) {
        const folder = `qwiksale/products/${id}`;
        const res = await uploadFromFile(file, { folder });
        urlFromBody = res.url || null;
        uploadedPublicId = res.publicId;
        if (!urlFromBody) throw new Error("Upload failed");
      } else if (typeof directUrl === "string" && directUrl.trim()) {
        urlFromBody = directUrl.trim();
      } else {
        return NextResponse.json({ error: "Provide a file or url" }, { status: 400 });
      }
    } else {
      // JSON (tolerate missing content-type)
      const j = await req.json().catch(() => null);
      if (!j || typeof j !== "object") {
        return NextResponse.json({ error: "Missing body" }, { status: 400 });
      }
      urlFromBody = pickUrlish(j);
      if (!urlFromBody) {
        return NextResponse.json({ error: "Missing image url" }, { status: 400 });
      }
    }

    const prev: string[] = Array.isArray(product.gallery) ? product.gallery : [];
    const exists = !!urlFromBody && prev.includes(urlFromBody);
    const nextGallery = exists || !urlFromBody ? prev : [...prev, urlFromBody];
    const nextImage = (makeCover || !product.image) && urlFromBody ? urlFromBody : product.image;

    const updated = await (prisma as any).product.update({
      where: { id },
      data: { gallery: nextGallery, image: nextImage },
      select: { id: true, image: true, gallery: true },
    });

    try {
      revalidatePath(`/product/${id}`);
      revalidatePath(`/product/${id}/edit`);
      revalidatePath(`/dashboard`);
    } catch {}

    return NextResponse.json({
      ok: true,
      url: urlFromBody || undefined,
      publicId: uploadedPublicId,
      image: updated.image,
      gallery: updated.gallery ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to add image" }, { status: 500 });
  }
}

/* ---------------------------- DELETE (remove) --------------------------- */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing product id" }, { status: 400 });

  // auth + owner/admin
  let session: any = null;
  try { session = await auth(); } catch {}
  const userId = session?.user?.id as string | undefined;
  const isAdmin = !!session?.user?.isAdmin;

  const product = await (prisma as any).product.findUnique({
    where: { id },
    select: { id: true, sellerId: true, image: true, gallery: true },
  }).catch(() => null);

  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  if (!userId || (!isAdmin && product.sellerId !== userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const prev: string[] = Array.isArray(product.gallery) ? product.gallery : [];
  const sp = new URL(req.url).searchParams;

  let url = decodeMaybe(
    sp.get("url") ||
      sp.get("href") ||
      sp.get("secure_url") ||
      sp.get("src") ||
      sp.get("path") ||
      sp.get("location") ||
      ""
  );
  let pid = decodeMaybe(sp.get("publicId") || sp.get("public_id") || "");

  // Legacy: ?id=<https-url> OR ?id=<publicId>
  const legacyId = decodeMaybe(sp.get("id") || "");
  if (!url && legacyId) {
    if (looksLikeUrl(legacyId)) url = legacyId;
    else if (!pid) pid = legacyId;
  }

  // Try JSON body too (even if content-type isn’t application/json)
  if (!url) {
    const j = await req.json().catch(() => null);
    if (j && typeof j === "object") {
      url = pickUrlish(j) || "";
      pid = pid || pickPublicIdish(j) || "";
    }
  }

  // If only pid, try to resolve URL from gallery
  if (!url && pid) {
    const found = prev.find((g) => (publicIdFromUrl(g) || "") === pid);
    if (found) url = found;
  }

  if (!url) {
    return NextResponse.json({ error: "Missing image url or resolvable publicId" }, { status: 400 });
  }

  try {
    const nextGallery = prev.filter((x) => x !== url);
    const nextImage = product.image === url ? (nextGallery[0] ?? null) : product.image;

    const updated = await (prisma as any).product.update({
      where: { id },
      data: { gallery: nextGallery, image: nextImage },
      select: { id: true, image: true, gallery: true },
    });

    const toDelete = pid || publicIdFromUrl(url) || "";
    if (toDelete) {
      try { await deleteByPublicId(toDelete); } catch { /* ignore */ }
    }

    try {
      revalidatePath(`/product/${id}`);
      revalidatePath(`/product/${id}/edit`);
      revalidatePath(`/dashboard`);
    } catch {}

    return NextResponse.json({
      ok: true,
      removed: url,
      image: updated.image,
      gallery: updated.gallery ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to remove image" }, { status: 500 });
  }
}
