// src/app/product/[id]/edit/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import DeleteListingButton from "@/app/components/DeleteListingButton";
import ProductMediaManager from "./ProductMediaManager";
import SectionHeader from "@/app/components/SectionHeader";
import CommitBinder from "./CommitBinder";
import SellProductClient from "@/app/sell/product/SellProductClient";

export const metadata: Metadata = {
  title: "Edit listing • QwikSale",
  robots: { index: false, follow: false },
};

const PLACEHOLDER = "/placeholder/default.jpg";

type Img = { id: string; url: string; isCover?: boolean; sort?: number };

function toUrlish(v: any): string {
  return String(
    v?.url ??
      v?.secure_url ??
      v?.secureUrl ??
      v?.src ??
      v?.location ??
      v?.path ??
      (typeof v === "string" ? v : "")
  ).trim();
}

/** Normalize images only from the main product row. */
function normalizeImagesFromRow(p: any): Img[] {
  const out: Img[] = [];
  const seen = new Set<string>();

  const push = (x: any, i: number) => {
    const url = toUrlish(x);
    if (!url || seen.has(url)) return;
    seen.add(url);

    const id = String(x?.id ?? x?.imageId ?? x?.publicId ?? x?.key ?? url ?? `img-${i}`);

    const isCover =
      !!x?.isCover ||
      !!(p?.coverImageId && x?.id && p.coverImageId === x.id) ||
      !!(typeof p?.coverImage === "string" && url === p.coverImage) ||
      !!(typeof p?.coverImageUrl === "string" && url === p.coverImageUrl) ||
      !!(typeof p?.image === "string" && url === p.image);

    const sort =
      Number.isFinite(x?.sortOrder)
        ? Number(x.sortOrder)
        : Number.isFinite(x?.sort)
        ? Number(x.sort)
        : Number.isFinite(x?.position)
        ? Number(x.position)
        : i;

    out.push({ id, url, isCover, sort });
  };

  const arrays = Array.isArray(p?.images)
    ? p.images
    : Array.isArray(p?.photos)
    ? p.photos
    : Array.isArray(p?.media)
    ? p.media
    : Array.isArray(p?.gallery)
    ? p.gallery
    : Array.isArray(p?.imageUrls)
    ? p.imageUrls
    : [];

  arrays.forEach((x: any, i: number) => push(x, i));

  if (out.length === 0 && typeof p?.image === "string" && p.image.trim()) {
    push(p.image, 0);
  }

  if (!out.some((x) => x.isCover) && out.length > 0) {
    const preferred =
      (typeof p?.image === "string" && p.image) ||
      (typeof p?.coverImage === "string" && p.coverImage) ||
      (typeof p?.coverImageUrl === "string" && p.coverImageUrl) ||
      null;

    let idx = preferred ? out.findIndex((x) => x.url === preferred) : 0;
    if (idx < 0) idx = 0;
    out[idx]!.isCover = true;
  }

  return out.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id.localeCompare(b.id)).slice(0, 50);
}

function getProductImageModel() {
  const any = prisma as any;
  const candidates = [any.productImage, any.productImages, any.ProductImage, any.ProductImages].filter(Boolean);
  return candidates.find((m: any) => typeof m?.findMany === "function") || null;
}

/** QUIET relation fetch by productId. */
async function fetchRelatedImageRows(productId: string): Promise<any[]> {
  const m = getProductImageModel();
  if (!m) return [];
  try {
    return await m.findMany({ where: { productId }, take: 50, orderBy: { id: "asc" } });
  } catch {
    return [];
  }
}

function rowsToImgs(rows: any[], parent: any): Img[] {
  const out: Img[] = [];
  let i = 0;
  for (const x of rows) {
    const url = toUrlish(x);
    if (!url) continue;
    const id = String(x?.id ?? x?.imageId ?? x?.key ?? url ?? `rimg-${i++}`);
    const isCover =
      !!x?.isCover ||
      !!(parent?.coverImageId && x?.id && parent.coverImageId === x.id) ||
      !!(typeof parent?.image === "string" && url === parent.image) ||
      !!(typeof parent?.coverImage === "string" && url === parent.coverImage) ||
      !!(typeof parent?.coverImageUrl === "string" && url === parent.coverImageUrl);

    const sort =
      Number.isFinite(x?.sortOrder)
        ? Number(x.sortOrder)
        : Number.isFinite(x?.sort)
        ? Number(x.sort)
        : Number.isFinite(x?.position)
        ? Number(x.position)
        : Number.isFinite(x?.order)
        ? Number(x.order)
        : i;

    out.push({ id, url, isCover, sort });
  }
  return out;
}

function mergeImgs(a: Img[], b: Img[], parent: any): Img[] {
  const byUrl = new Map<string, Img>();
  const add = (img: Img) => {
    const key = img.url.trim();
    if (!key) return;
    const prev = byUrl.get(key);
    if (!prev) byUrl.set(key, { ...img });
    else
      byUrl.set(key, {
        ...prev,
        isCover: !!(prev.isCover || img.isCover),
        sort: typeof prev.sort === "number" ? prev.sort : typeof img.sort === "number" ? img.sort : 0,
      });
  };
  a.forEach(add);
  b.forEach(add);

  let list = Array.from(byUrl.values());

  if (!list.some((x) => x.isCover) && list.length > 0) {
    const preferred =
      (typeof parent?.image === "string" && parent.image) ||
      (typeof parent?.coverImage === "string" && parent.coverImage) ||
      (typeof parent?.coverImageUrl === "string" && parent.coverImageUrl) ||
      (list[0] ? list[0].url : undefined);
    const idx = list.findIndex((x) => x.url === preferred);
    if (list.length > 0) list[idx >= 0 ? idx : 0]!.isCover = true;
  }

  list = list.sort((x, y) => (x.sort ?? 0) - (y.sort ?? 0) || x.id.localeCompare(y.id)).slice(0, 50);
  return list;
}

function briefStatus(p: any): string {
  const s = String(p?.status ?? "").toUpperCase();
  if (["ACTIVE", "DRAFT", "PAUSED", "ARCHIVED"].includes(s)) return s;
  if (p?.published === true) return "ACTIVE";
  if (p?.published === false) return "DRAFT";
  return "—";
}

function fmtDate(d?: Date | string | null) {
  if (!d) return "—";
  const dd = typeof d === "string" ? new Date(d) : d;
  if (!(dd instanceof Date) || isNaN(dd.getTime())) return "—";
  return dd.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) notFound();

  // 🔒 Unauthed → redirect to sign-in with callback back to this edit page
  let session: any = null;
  try {
    session = await auth();
  } catch {
    session = null;
  }
  const userId = session?.user?.id as string | undefined;
  if (!userId) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(`/product/${id}/edit`)}`);
  }

  let product: any = null;
  try {
    product = await (prisma as any).product.findUnique({ where: { id } });
  } catch {
    product = null;
  }
  if (!product) notFound();

  const isAdmin = Boolean(session?.user?.isAdmin);
  const isOwner = Boolean(userId && product.sellerId === userId);
  if (!(isOwner || isAdmin)) notFound();

  let relationRows: any[] = [];
  try {
    relationRows = await fetchRelatedImageRows(id);
  } catch {
    relationRows = [];
  }

  const images = mergeImgs(
    normalizeImagesFromRow(product),
    rowsToImgs(relationRows, product),
    product
  );
  const canDelete = isOwner || isAdmin;
  const lastUpdated = product?.updatedAt ?? product?.createdAt ?? null;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <SectionHeader
        title={`Editing: ${product?.name ?? "Product"}`}
        subtitle={
          <>
            <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/95">
              Product Editor
            </span>
            <span className="mx-2 hidden text-white/70 md:inline">•</span>
            <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/95">
              Status: <span className="ml-1 font-semibold">{briefStatus(product)}</span>
            </span>
            <span className="mx-2 hidden text-white/70 md:inline">•</span>
            <span className="text-white/90">
              ID <span className="font-mono">{product.id}</span> · Updated {fmtDate(lastUpdated)}
            </span>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard" prefetch={false} className="btn-outline" aria-label="Back to dashboard">
              Back
            </Link>
            <Link
              href={`/product/${product.id}`}
              prefetch={false}
              className="btn-outline"
              aria-label="View live product"
            >
              View live
            </Link>
            {canDelete && (
              <DeleteListingButton
                productId={product.id}
                label="Delete"
                className="btn-danger"
                redirectHref="/?deleted=1"
              />
            )}
          </div>
        }
      />

      <section className="mt-6 card p-5">
        <ProductMediaManager
          productId={product.id}
          initial={
            images.length
              ? images.map((img) => ({
                  ...img,
                  isCover: !!img.isCover,
                  sort: typeof img.sort === "number" ? img.sort : 0,
                }))
              : [{ id: "placeholder", url: PLACEHOLDER, isCover: true, sort: 0 }]
          }
          max={6}
        />
      </section>

      <section className="mt-6 card p-5">
        <CommitBinder productId={product.id} />
        <div id="sell-form-host">
          <SellProductClient id={product.id} hideMedia />
        </div>
      </section>
    </main>
  );
}
