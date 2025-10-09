// src/app/product/[id]/edit/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import SellProductClient from "@/app/sell/product/SellProductClient";
import DeleteListingButton from "@/app/components/DeleteListingButton";
import ProductMediaManager from "./ProductMediaManager";

export const metadata: Metadata = {
  title: "Edit listing • QwikSale",
  robots: { index: false, follow: false },
};

/* ----------------------------- Helpers ----------------------------- */
type Img = { id: string; url: string; isCover?: boolean; sort?: number };

function normalizeImages(p: any): Img[] {
  const out: Img[] = [];
  const seenByUrl = new Set<string>();

  const push = (x: any, i: number) => {
    const id = String(
      x?.id ?? x?.imageId ?? x?.publicId ?? x?.key ?? x?.url ?? (typeof x === "string" ? x : undefined) ?? `img-${i}`,
    );

    const url = String(
      x?.url ?? x?.secureUrl ?? x?.src ?? x?.location ?? x?.path ?? (typeof x === "string" ? x : "") ?? "",
    ).trim();

    if (!url || seenByUrl.has(url)) return;
    seenByUrl.add(url);

    const isCover =
      Boolean(x?.isCover) ||
      Boolean(p?.coverImageId && x?.id && p.coverImageId === x.id) ||
      Boolean(typeof p?.coverImage === "string" && url === p.coverImage) ||
      Boolean(typeof p?.coverImageUrl === "string" && url === p.coverImageUrl) ||
      Boolean(typeof p?.image === "string" && url === p.image);

    const sort =
      Number.isFinite(x?.sortOrder) ? Number(x.sortOrder) :
      Number.isFinite(x?.sort) ? Number(x.sort) :
      Number.isFinite(x?.position) ? Number(x.position) :
      i;

    out.push({ id, url, isCover, sort });
  };

  const arr =
    Array.isArray(p?.images) ? p.images :
    Array.isArray(p?.photos) ? p.photos :
    Array.isArray(p?.media) ? p.media :
    Array.isArray(p?.gallery) ? p.gallery :
    Array.isArray(p?.imageUrls) ? p.imageUrls :
    [];

  arr.forEach((x: any, i: number) => push(x, i));

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

function briefStatus(p: any): string {
  const s = String(p?.status ?? "").toUpperCase();
  if (["ACTIVE", "DRAFT", "PAUSED", "ARCHIVED"].includes(s)) return s;
  if (p?.published === true || p?.isActive === true) return "ACTIVE";
  if (p?.published === false) return "DRAFT";
  return "—";
}

function fmtDate(d?: Date | string | null) {
  if (!d) return "—";
  const dd = typeof d === "string" ? new Date(d) : d;
  if (!(dd instanceof Date) || isNaN(dd.getTime())) return "—";
  return dd.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/* ----------------------- Server Action (quick save) ----------------------- */
async function saveQuickAction(formData: FormData) {
  "use server";
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!id || !name) return;

  // Auth & ownership check
  const session = await auth().catch(() => null as any);
  const userId = session?.user?.id as string | undefined;
  const isAdmin = Boolean(session?.user?.isAdmin);

  const product: any = await (prisma as any).product.findUnique({ where: { id } }).catch(() => null);
  if (!product) return;

  const isOwner = Boolean(userId && product.sellerId === userId);
  if (!isOwner && !isAdmin) return;

  // Tolerant update (support both name/title fields)
  await (prisma as any).product.update({
    where: { id },
    data: { name, title: name },
  }).catch(() => {});

  revalidatePath(`/product/${id}/edit`);
}

/* ----------------------- Page (Next 15: params is a Promise) ----------------------- */
export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <p className="text-sm text-gray-600">Missing product id.</p>
      </main>
    );
  }

  let session: any = null;
  try {
    session = await auth();
  } catch {
    session = null;
  }
  const userId = session?.user?.id as string | undefined;
  const isAdmin = Boolean(session?.user?.isAdmin);

  let product: any = null;
  try {
    product = await (prisma as any).product.findUnique({ where: { id } });
  } catch {
    product = null;
  }

  if (!product) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <p className="text-sm text-gray-600">Product not found.</p>
      </main>
    );
  }

  const isOwner = Boolean(userId && product.sellerId === userId);
  const canDelete = isOwner || isAdmin;
  const images = normalizeImages(product);
  const lastUpdated = product?.updatedAt ?? product?.createdAt ?? null;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      {/* Header / Hero */}
      <div className="rounded-2xl border border-black/5 bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue p-5 text-white shadow-md dark:border-white/10">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">
                Product Editor
              </span>
              <span className="inline-flex items-center rounded-full bg-white/15 px-2 py-0.5 text-xs">
                Status: <span className="ml-1 font-semibold">{briefStatus(product)}</span>
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-extrabold md:text-3xl">
              Editing: {product?.name ?? "Product"}
            </h1>
            <p className="mt-1 text-sm text-white/90">
              ID <span className="font-mono">{product.id}</span>
              <span className="mx-2">•</span>
              Last updated <span className="font-medium">{fmtDate(lastUpdated)}</span>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/product/${product.id}`}
              prefetch={false}
              className="rounded-lg bg-white/20 px-3 py-2 text-sm font-semibold hover:bg-white/30"
              aria-label="View live listing"
            >
              View live
            </Link>

            {canDelete ? (
              <DeleteListingButton
                productId={product.id}
                label="Delete"
                className="rounded-lg bg-red-600/90 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600"
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Quick fields (read-only when not owner) */}
      <section className="mt-6 grid gap-6 md:grid-cols-[1fr]">
        <form
          aria-label="Edit product quick fields"
          className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900"
          action={isOwner ? saveQuickAction : undefined}
        >
          <input type="hidden" name="id" value={product.id} />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label
                htmlFor="edit-name"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200"
              >
                Product name
              </label>
              <input
                id="edit-name"
                name="name"
                type="text"
                defaultValue={product.name ?? ""}
                className="w-full rounded-lg border px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                readOnly={!isOwner}
                aria-readonly={!isOwner}
                placeholder="e.g. iPhone 13, 128GB"
              />
              {!isOwner ? (
                <p className="mt-2 text-xs text-gray-500">
                  You must be the owner to edit this listing. Showing read-only details.
                </p>
              ) : (
                <p className="mt-2 text-xs text-gray-500">
                  For full details (pricing, condition, category), use the editor below.
                </p>
              )}
            </div>

            <div className="flex items-end">
              {isOwner ? (
                <button
                  type="submit"
                  className="h-10 w-full rounded-lg bg-[#161748] px-4 text-sm font-semibold text-white hover:opacity-90"
                  aria-label="Save quick changes"
                >
                  Save changes
                </button>
              ) : null}
            </div>
          </div>
        </form>
      </section>

      {/* Media section (single surface, cap defaults to 6) */}
      <section className="mt-6 rounded-2xl border border-black/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
        {isOwner ? (
          <ProductMediaManager productId={product.id} initial={images} />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Photos</h2>
              <div className="text-sm text-gray-500">
                {images.length} photo{images.length === 1 ? "" : "s"}
              </div>
            </div>
            {images.length === 0 ? (
              <div className="mt-3 rounded-lg border border-dashed p-6 text-center text-sm text-gray-600 dark:border-slate-700 dark:text-slate-300">
                No photos.
              </div>
            ) : (
              <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {images.map((img) => (
                  <li
                    key={`${img.id}-${img.url}`}
                    className="relative overflow-hidden rounded-lg border bg-white dark:border-slate-700 dark:bg-slate-950"
                  >
                    <img
                      src={img.url}
                      alt={img.isCover ? "Cover photo" : "Photo"}
                      className="h-40 w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent p-2 text-xs text-white">
                      <span className="font-medium truncate">
                        {img.isCover ? "Cover photo" : "Photo"}
                      </span>
                      <span className="opacity-80">#{(img.sort ?? 0) + 1}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {/* Full editor (owner only; hide legacy uploader) */}
      {isOwner ? (
        <section className="mt-6 rounded-2xl border border-black/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <SellProductClient id={product.id} hideMedia />
        </section>
      ) : (
        <section className="mt-6 rounded-2xl border border-black/5 p-5 text-sm text-gray-700 shadow-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">
          <p>
            If this is your listing,{" "}
            <Link
              href={`/signin?callbackUrl=${encodeURIComponent(`/product/${product.id}/edit`)}`}
              className="text-[#39a0ca] hover:underline"
            >
              sign in
            </Link>{" "}
            to make changes.
          </p>
        </section>
      )}
    </main>
  );
}
