// src/app/service/[id]/edit/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import DeleteListingButton from "@/app/components/DeleteListingButton";
import ServiceMediaManager from "./ServiceMediaManager";
import SectionHeader from "@/app/components/SectionHeader";
import CommitBinder from "./CommitBinder";
import SellServiceClient from "@/app/sell/service/SellServiceClient";

export const metadata: Metadata = {
  title: "Edit service • QwikSale",
  robots: { index: false, follow: false },
};

/* ----------------------------------------------------------------
 *  Model compat
 * ---------------------------------------------------------------- */
function getServiceModel() {
  const any = prisma as any;
  const candidate =
    any.service ??
    any.services ??
    any.Service ??
    any.Services ??
    null;
  return candidate && typeof candidate.findUnique === "function" ? candidate : null;
}

/* ----------------------------------------------------------------
 *  Helpers
 * ---------------------------------------------------------------- */
const PLACEHOLDER = "/placeholder/default.jpg";
type Img = { id: string; url: string; isCover?: boolean; sort?: number | undefined };

function toUrlish(v: any): string {
  return String(
    v?.url ??
      v?.secure_url ?? // ✅ handle Cloudinary default key
      v?.secureUrl ??  // ✅ handle camelCase variant
      v?.src ??
      v?.location ??
      v?.path ??
      (typeof v === "string" ? v : "")
  ).trim();
}

function normalizeImagesFromRow(p: any): Img[] {
  const out: Img[] = [];
  const seen = new Set<string>();

  const push = (x: any, i: number) => {
    const url = toUrlish(x);
    if (!url || seen.has(url)) return;
    seen.add(url);

    const id = String(
      x?.id ??
        x?.imageId ??
        x?.publicId ??
        x?.key ??
        url ??
        `img-${i}`
    );

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

  const arrays =
    Array.isArray(p?.images) ? p.images :
    Array.isArray(p?.photos) ? p.photos :
    Array.isArray(p?.media) ? p.media :
    Array.isArray(p?.gallery) ? p.gallery :
    Array.isArray(p?.imageUrls) ? p.imageUrls :
    [];

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

  return out
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id.localeCompare(b.id))
    .slice(0, 50);
}

/** single service-image model, QUIET via serviceId */
function getServiceImageModel() {
  const any = prisma as any;
  const candidates = [
    any.serviceImage,
    any.serviceImages,
    any.ServiceImage,
    any.ServiceImages,
  ].filter(Boolean);
  return candidates.find((m) => typeof m?.findMany === "function") || null;
}

async function fetchRelatedImageRows(serviceId: string): Promise<any[]> {
  const m = getServiceImageModel();
  if (!m) return [];
  try {
    return await m.findMany({
      where: { serviceId },
      take: 50,
      orderBy: { id: "asc" },
    });
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
      Boolean(x?.isCover) ||
      Boolean(parent?.coverImageId && x?.id && parent.coverImageId === x.id) ||
      Boolean(typeof parent?.image === "string" && url === parent.image) ||
      Boolean(typeof parent?.coverImage === "string" && url === parent.coverImage) ||
      Boolean(typeof parent?.coverImageUrl === "string" && url === parent.coverImageUrl);

    const sort =
      Number.isFinite(x?.sortOrder) ? Number(x.sortOrder) :
      Number.isFinite(x?.sort) ? Number(x.sort) :
      Number.isFinite(x?.position) ? Number(x.position) :
      Number.isFinite(x?.order) ? Number(x.order) :
      i;

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
    else {
      byUrl.set(key, {
        ...prev,
        isCover: !!(prev.isCover || img.isCover),
        sort: Number.isFinite(prev.sort) ? prev.sort : img.sort,
      });
    }
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
    if (list.length > 0) {
      list[idx >= 0 ? idx : 0]!.isCover = true;
    }
  }

  list = list
    .sort((x, y) => (x.sort ?? 0) - (y.sort ?? 0) || x.id.localeCompare(y.id))
    .slice(0, 50);

  return list;
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

/* ----------------------------------------------------------------
 *  Server Action
 * ---------------------------------------------------------------- */
async function saveQuickAction(formData: FormData) {
  "use server";
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!id) return;

  const Service = getServiceModel();
  if (!Service) return;

  if (name) {
    try {
      await Service.update({
        where: { id },
        data: {
          name,
          title: name, // safe even if 'title' missing (wrapped in try/catch)
        },
      });
    } catch {}
  }

  revalidatePath(`/service/${id}/edit`);
}

/* ----------------------------------------------------------------
 *  Page
 * ---------------------------------------------------------------- */
export default async function EditServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id) notFound();

  let session: any = null;
  try {
    session = await auth();
  } catch {}
  const userId = session?.user?.id as string | undefined;
  if (!userId) notFound();

  const Service = getServiceModel();
  if (!Service) notFound();

  let service: any = null;
  try {
    service = await Service.findUnique({ where: { id } });
  } catch {
    service = null;
  }
  if (!service) notFound();
  if (service.sellerId !== userId) notFound();

  // QUIET relation fetch
  let relationRows: any[] = [];
  try {
    relationRows = await fetchRelatedImageRows(id);
  } catch {
    relationRows = [];
  }

  const fromRow = normalizeImagesFromRow(service);
  const fromRelations = rowsToImgs(relationRows, service);
  const images: Img[] = mergeImgs(fromRow, fromRelations, service);

  const lastUpdated = service?.updatedAt ?? service?.createdAt ?? null;
  const serviceName = service?.name ?? service?.title ?? "Service";

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <SectionHeader
        title={`Editing: ${serviceName}`}
        subtitle={
          <>
            <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/95">
              Service Editor
            </span>
            <span className="mx-2 hidden text-white/70 md:inline">•</span>
            <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/95">
              Status: <span className="ml-1 font-semibold">{briefStatus(service)}</span>
            </span>
            <span className="mx-2 hidden text-white/70 md:inline">•</span>
            <span className="text-white/90">
              ID <span className="font-mono">{service.id}</span> · Updated {fmtDate(lastUpdated)}
            </span>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard" prefetch={false} className="btn-outline" aria-label="Back to dashboard">
              Back
            </Link>
            <Link href={`/service/${service.id}`} prefetch={false} className="btn-outline" aria-label="View live service">
              View live
            </Link>
            <DeleteListingButton serviceId={service.id} label="Delete" className="btn-danger" />
          </div>
        }
      />

      {/* Media Manager (staged; no auto-persist) */}
      <section className="mt-6 card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Photos</h2>
          <div className="text-sm text-gray-500 dark:text-slate-400">
            {images.length} photo{images.length === 1 ? "" : "s"}
          </div>
        </div>
        <ServiceMediaManager
          serviceId={service.id}
          initial={
            images.length
              ? images.map(img => ({
                  ...img,
                  isCover: !!img.isCover,
                  sort: typeof img.sort === "number" ? img.sort : 0,
                }))
              : [{ id: "placeholder", url: PLACEHOLDER, isCover: true, sort: 0 }]
          }
        />
      </section>

      {/* Full editor (commit media first via CommitBinder; ensure it doesn’t send/overwrite media). */}
      <section className="mt-6 card p-5">
        <CommitBinder serviceId={service.id} />
        <div id="sell-form-host">
          <SellServiceClient editId={service.id} hideMedia />
        </div>
      </section>
    </main>
  );
}
