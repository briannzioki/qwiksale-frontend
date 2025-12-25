export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import DeleteListingButton from "@/app/components/DeleteListingButton";
import ServiceMediaManager from "./ServiceMediaManager";
import CommitBinder from "./CommitBinder";
import SellServiceClient from "@/app/sell/service/SellServiceClient";

export const metadata: Metadata = {
  title: "Edit service · QwikSale",
  robots: { index: false, follow: false },
};

/* -------------------------- Model compat -------------------------- */
function getServiceModel() {
  const any = prisma as any;
  const candidate = any.service ?? any.services ?? any.Service ?? any.Services ?? null;
  return candidate && typeof candidate.findUnique === "function" ? candidate : null;
}

/* ------------------------------ Helpers ------------------------------ */
const PLACEHOLDER = "/placeholder/default.jpg";

type Img = {
  id: string;
  url: string;
  isCover?: boolean;
  sort?: number | undefined;
};

function toUrlish(v: any): string {
  return String(
    v?.url ??
      v?.secure_url ??
      v?.secureUrl ??
      v?.src ??
      v?.location ??
      v?.path ??
      (typeof v === "string" ? v : ""),
  ).trim();
}

function normalizeImagesFromRow(p: any): Img[] {
  const out: Img[] = [];
  const seen = new Set<string>();

  const push = (x: any, i: number) => {
    const url = toUrlish(x);
    if (!url || seen.has(url)) return;
    seen.add(url);

    const id = String(x?.id ?? x?.imageId ?? x?.publicId ?? x?.key ?? url ?? `img-${i}`);

    const isCover =
      Boolean(x?.isCover) ||
      Boolean(p?.coverImageId && x?.id && p.coverImageId === x.id) ||
      Boolean(typeof p?.coverImage === "string" && url === p.coverImage) ||
      Boolean(typeof p?.coverImageUrl === "string" && url === p.coverImageUrl) ||
      Boolean(typeof p?.image === "string" && url === p.image);

    const sort = Number.isFinite(x?.sortOrder)
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

  return out
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id.localeCompare(b.id))
    .slice(0, 50);
}

/** single service-image model, quiet via serviceId */
function getServiceImageModel() {
  const any = prisma as any;
  const candidates = [any.serviceImage, any.serviceImages, any.ServiceImage, any.ServiceImages].filter(
    Boolean,
  );
  return candidates.find((m: any) => typeof m?.findMany === "function") || null;
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

    const sort = Number.isFinite(x?.sortOrder)
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
    if (!prev) {
      byUrl.set(key, { ...img });
    } else {
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
    if (list.length > 0) list[idx >= 0 ? idx : 0]!.isCover = true;
  }

  list = list
    .sort((x, y) => (x.sort ?? 0) - (y.sort ?? 0) || x.id.localeCompare(y.id))
    .slice(0, 50);

  return list;
}

function briefStatus(p: any): string {
  const s = String(p?.status ?? "").toUpperCase();
  if (["ACTIVE", "DRAFT", "PAUSED", "ARCHIVED"].includes(s)) return s;
  if (p?.published === true) return "ACTIVE";
  if (p?.published === false) return "DRAFT";
  return "-";
}

function fmtDate(d?: Date | string | null) {
  if (!d) return "-";
  const dd = typeof d === "string" ? new Date(d) : d;
  if (!(dd instanceof Date) || isNaN(dd.getTime())) return "-";
  return dd.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/* -------------------------------- Page -------------------------------- */
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
  } catch {
    session = null;
  }
  const userId = session?.user?.id as string | undefined;
  const isAdmin = Boolean(session?.user?.isAdmin);
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

  const isOwner = Boolean(userId && service.sellerId === userId);
  if (!(isOwner || isAdmin)) notFound();

  let relationRows: any[] = [];
  try {
    relationRows = await fetchRelatedImageRows(id);
  } catch {
    relationRows = [];
  }

  const images = mergeImgs(normalizeImagesFromRow(service), rowsToImgs(relationRows, service), service);

  const lastUpdated = service?.updatedAt ?? service?.createdAt ?? null;
  const serviceName = service?.name ?? service?.title ?? "Service";
  const canDelete = isOwner || isAdmin;

  return (
    <main className="container-page py-4 sm:py-6">
      <header className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-soft">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]" />

        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-3 sm:p-5">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight tracking-tight text-[var(--text)] sm:text-2xl md:text-3xl">
              Editing: {serviceName}
            </h1>

            <div className="mt-1 text-xs text-[var(--text-muted)] sm:text-sm">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text)]">
                  Service editor
                </span>

                <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] text-[var(--text)]">
                  Status: <span className="ml-1 font-semibold">{briefStatus(service)}</span>
                </span>

                <span className="text-[11px] text-[var(--text-muted)]">
                  ID <span className="font-mono text-[var(--text)]">{service.id}</span> • Updated{" "}
                  <span className="text-[var(--text)]">{fmtDate(lastUpdated)}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            <Link
              href="/dashboard"
              prefetch={false}
              className="btn-outline"
              aria-label="Back to dashboard"
            >
              Back
            </Link>
            <Link
              href={`/service/${service.id}`}
              prefetch={false}
              className="btn-outline"
              aria-label="View live service"
            >
              View live
            </Link>
            {canDelete && (
              <DeleteListingButton
                serviceId={service.id}
                label="Delete"
                className="btn-danger"
                redirectHref="/?deleted=1"
              />
            )}
          </div>
        </div>
      </header>

      <section className="mt-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-[var(--text)] shadow-soft sm:mt-6 sm:p-5">
        <div className="mb-2 flex items-center justify-between sm:mb-3">
          <h2 className="text-base font-semibold text-[var(--text)] sm:text-lg">Photos</h2>
          <div className="text-xs text-[var(--text-muted)] sm:text-sm">
            {images.length} photo{images.length === 1 ? "" : "s"}
          </div>
        </div>

        <ServiceMediaManager
          serviceId={service.id}
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

      <section className="mt-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-[var(--text)] shadow-soft sm:mt-6 sm:p-5">
        <CommitBinder serviceId={service.id} />
        <div id="sell-form-host">
          <SellServiceClient editId={service.id} hideMedia />
        </div>
      </section>
    </main>
  );
}
