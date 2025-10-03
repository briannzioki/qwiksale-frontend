// src/app/service/[id]/edit/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import EditMediaClient from "@/app/components/EditMediaClient";

export const metadata: Metadata = {
  title: "Edit service • QwikSale",
  robots: { index: false, follow: false },
};

/** Access a Service-model compat layer that may not exist or may be named differently */
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

// -------- helpers: tolerant image normalization (schema-agnostic) --------
type Img = { id: string; url: string; isCover?: boolean; sort?: number };

function normalizeImages(p: any): Img[] {
  const out: Img[] = [];
  const push = (x: any, i: number) => {
    const id = String(
      x?.id ??
        x?.imageId ??
        x?.publicId ??
        x?.key ??
        x?.url ??
        (typeof x === "string" ? x : undefined) ??
        `img-${i}`
    );
    const url = String(
      x?.url ??
        x?.secureUrl ??
        x?.src ??
        x?.location ??
        x?.path ??
        (typeof x === "string" ? x : "") ??
        ""
    ).trim();
    if (!url) return;

    const isCover =
      Boolean(x?.isCover) ||
      Boolean(p?.coverImageId && x?.id && p.coverImageId === x.id) ||
      Boolean(typeof p?.coverImage === "string" && url === p.coverImage) ||
      Boolean(typeof p?.coverImageUrl === "string" && url === p.coverImageUrl) ||
      Boolean(typeof p?.image === "string" && url === p.image); // Service.image

    const sort =
      Number.isFinite(x?.sortOrder) ? Number(x.sortOrder) :
      Number.isFinite(x?.sort) ? Number(x.sort) :
      Number.isFinite(x?.position) ? Number(x.position) :
      i;

    out.push({ id, url, isCover, sort });
  };

  // Prefer arrays; support gallery[] & bare string arrays
  const arr =
    Array.isArray(p?.images) ? p.images :
    Array.isArray(p?.photos) ? p.photos :
    Array.isArray(p?.media) ? p.media :
    Array.isArray(p?.gallery) ? p.gallery :
    Array.isArray(p?.imageUrls) ? p.imageUrls :
    [];

  arr.forEach((x: any, i: number) => push(x, i));

  // If no array entries but a single cover string exists, seed it
  if (out.length === 0 && typeof p?.image === "string" && p.image.trim()) {
    push(p.image, 0);
  }

  // Ensure a cover: prefer Service.image / cover*; otherwise fall back to first item
  if (!out.some((x) => x.isCover) && out.length > 0) {
    const preferred =
      (typeof p?.image === "string" && p.image) ||
      (typeof p?.coverImage === "string" && p.coverImage) ||
      (typeof p?.coverImageUrl === "string" && p.coverImageUrl) ||
      null;

    let idx = preferred ? out.findIndex((x) => x.url === preferred) : 0;
    if (idx < 0) idx = 0; // fallback if preferred not found
    out[idx]!.isCover = true;
  }

  // Stable sort
  return out.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id.localeCompare(b.id));
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

export default async function EditServicePage(props: any) {
  // Accept `any` to satisfy Next's PageProps checker
  const id = String(props?.params?.id ?? "");
  if (!id) notFound();

  // Require auth and ownership (preserves your previous behavior)
  const session = await auth().catch(() => null);
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) notFound();

  const Service = getServiceModel();
  if (!Service) notFound();

  // Try to fetch with images included; fall back to narrower shape
  let service: any = null;
  try {
    service = await Service.findUnique({
      where: { id },
      include: { images: true },
    });
  } catch {
    // ignore; try narrower shape below
  }

  if (!service) {
    try {
      service = await Service.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          title: true,
          sellerId: true,
          updatedAt: true,
          createdAt: true,
          status: true,
          image: true,       // cover
          gallery: true,     // ordered list
          coverImage: true,
          coverImageUrl: true,
          imageUrls: true,
          photos: true,
        },
      });
    } catch {
      service = await Service.findUnique({
        where: { id },
        select: { id: true, name: true, title: true, sellerId: true },
      });
    }
  }

  if (!service) notFound();
  if (service.sellerId !== userId) notFound();

  const images = normalizeImages(service);
  const lastUpdated = service?.updatedAt ?? service?.createdAt ?? null;
  const serviceName = service?.name ?? service?.title ?? "Service";

  // Optional: render your full editor if it exists
  let SellServiceClient: any = null;
  try {
    // Will succeed only if you have this file in your repo
    SellServiceClient = (await import("@/app/sell/service/SellServiceClient")).default;
  } catch {
    SellServiceClient = null;
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      {/* Edit-mode header */}
      <div className="rounded-xl p-4 text-white bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue shadow-soft dark:shadow-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold">Editing: {serviceName}</h1>
            <p className="mt-1 text-white/90 text-sm">
              ID <span className="font-mono">{service.id}</span>
              <span className="mx-2">•</span>
              Last updated <span className="font-medium">{fmtDate(lastUpdated)}</span>
              <span className="mx-2">•</span>
              Status <span className="font-semibold">{briefStatus(service)}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/service/${service.id}`}
              className="rounded-md bg-white/20 px-3 py-1.5 text-sm font-medium hover:bg-white/30"
              prefetch={false}
            >
              View live
            </Link>
          </div>
        </div>
      </div>

      {/* Quick fields (kept for testability) */}
      <form
        aria-label="Edit service quick fields"
        className="mt-4 rounded-xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        action="#"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="edit-service-name"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200"
            >
              Service Name
            </label>
            <input
              id="edit-service-name"
              name="name"
              type="text"
              defaultValue={serviceName}
              className="w-full rounded-md border px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
              readOnly
              aria-readonly="true"
              placeholder="e.g. House Cleaning, M-Pesa Agent…"
            />
            <p className="mt-2 text-xs text-gray-500">
              Full editing happens below (or in the Sell flow).
            </p>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="rounded-lg bg-[#161748] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              aria-label="Update"
            >
              Save changes
            </button>
          </div>
        </div>
      </form>

      {/* Media section (wired to MediaManager) */}
      <section className="mt-6 rounded-xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <EditMediaClient
          entity="service"
          entityId={service.id}
          initial={images}
          max={10}
        />
      </section>

      {/* Full editor — render if present, otherwise show a CTA to the Sell flow */}
      {SellServiceClient ? (
        <div className="mt-6">
          <SellServiceClient id={service.id} />
        </div>
      ) : (
        <div className="mt-6 rounded-lg border p-4 text-sm text-gray-700 dark:border-slate-800 dark:text-slate-200">
          <p>
            For full editing, continue in the Sell flow. It’ll prefill this service automatically.
          </p>
          <div className="mt-3">
            <Link
              href={`/sell/service?id=${encodeURIComponent(service.id)}`}
              prefetch={false}
              className="rounded-lg bg-[#161748] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Open full editor
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
