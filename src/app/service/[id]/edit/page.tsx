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

export const metadata: Metadata = {
  title: "Edit service • QwikSale",
  robots: { index: false, follow: false },
};

/* ----------------------------------------------------------------
 *  Model compat: tolerate different Service model names or absence
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
type Img = { id: string; url: string; isCover?: boolean; sort?: number };

function normalizeImages(p: any): Img[] {
  const out: Img[] = [];
  const seen = new Set<string>();

  const push = (x: any, i: number) => {
    const id = String(
      x?.id ??
        x?.imageId ??
        x?.publicId ??
        x?.key ??
        x?.url ??
        (typeof x === "string" ? x : undefined) ??
        `img-${i}`,
    );

    const url = String(
      x?.url ??
        x?.secureUrl ??
        x?.src ??
        x?.location ??
        x?.path ??
        (typeof x === "string" ? x : "") ??
        "",
    ).trim();

    if (!url || seen.has(url)) return;
    seen.add(url);

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

  return out
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id.localeCompare(b.id))
    .slice(0, 50);
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
 *  Server Action for the quick "name" save (no client handler!)
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
      // Be tolerant of varying field names
      await Service.update({
        where: { id },
        data: {
          name,
          title: name,
        },
      });
    } catch {
      // ignore update failures silently for now
    }
  }

  // Revalidate this page so the latest value shows after submit
  revalidatePath(`/service/${id}/edit`);
}

/* ----------------------------------------------------------------
 *  Page (Next 15: params is a Promise)
 * ---------------------------------------------------------------- */
export default async function EditServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id) notFound();

  // Require auth & ownership (strict gate for services editor)
  let session: any = null;
  try {
    session = await auth();
  } catch {
    /* ignore */
  }
  const userId = session?.user?.id as string | undefined;
  if (!userId) notFound();

  // Resolve model (tolerant to schema drift)
  const Service = getServiceModel();
  if (!Service) notFound();

  // Fetch record with safe shape (no brittle include/select)
  let service: any = null;
  try {
    service = await Service.findUnique({ where: { id } });
  } catch {
    service = null;
  }
  if (!service) notFound();
  if (service.sellerId !== userId) notFound();

  const images = normalizeImages(service);
  const lastUpdated = service?.updatedAt ?? service?.createdAt ?? null;
  const serviceName = service?.name ?? service?.title ?? "Service";

  // Try to load a full editor if your repo has it; otherwise show a CTA
  let SellServiceClient: any = null;
  try {
    SellServiceClient = (await import("@/app/sell/service/SellServiceClient")).default;
  } catch {
    SellServiceClient = null;
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      {/* Header / Hero */}
      <div className="rounded-2xl border border-black/5 bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue p-5 text-white shadow-md dark:border-white/10">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">
                Service Editor
              </span>
              <span className="inline-flex items-center rounded-full bg-white/15 px-2 py-0.5 text-xs">
                Status: <span className="ml-1 font-semibold">{briefStatus(service)}</span>
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-extrabold md:text-3xl">
              Editing: {serviceName}
            </h1>
            <p className="mt-1 text-sm text-white/90">
              ID <span className="font-mono">{service.id}</span>
              <span className="mx-2">•</span>
              Last updated <span className="font-medium">{fmtDate(lastUpdated)}</span>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/service/${service.id}`}
              prefetch={false}
              className="rounded-lg bg-white/20 px-3 py-2 text-sm font-semibold hover:bg-white/30"
              aria-label="View live service"
            >
              View live
            </Link>

            {/* Delete button is a Client Component; safe to render with props */}
            <DeleteListingButton
              serviceId={service.id}
              label="Delete"
              className="rounded-lg bg-red-600/90 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600"
            />
          </div>
        </div>
      </div>

      {/* Quick fields */}
      <section className="mt-6 grid gap-6 md:grid-cols-[1fr]">
        <form
          aria-label="Edit service quick fields"
          className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900"
          action={saveQuickAction}
        >
          <input type="hidden" name="id" value={service.id} />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label
                htmlFor="edit-service-name"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200"
              >
                Service name
              </label>
              <input
                id="edit-service-name"
                name="name"
                type="text"
                defaultValue={serviceName}
                className="w-full rounded-lg border px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                placeholder="e.g. House Cleaning, M-Pesa Agent…"
              />
              <p className="mt-2 text-xs text-gray-500">
                For full details (pricing, availability, service area), use the editor below.
              </p>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="h-10 w-full rounded-lg bg-[#161748] px-4 text-sm font-semibold text-white hover:opacity-90"
                aria-label="Save quick changes"
              >
                Save changes
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* Media Manager */}
      <section className="mt-6 rounded-2xl border border-black/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Photos</h2>
          <div className="text-sm text-gray-500 dark:text-slate-400">
            {images.length} photo{images.length === 1 ? "" : "s"}
          </div>
        </div>
        <ServiceMediaManager serviceId={service.id} initial={images} />
      </section>

      {/* Full editor (optional) */}
      {SellServiceClient ? (
        <section className="mt-6 rounded-2xl border border-black/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <SellServiceClient editId={service.id} hideMedia />
        </section>
      ) : (
        <section className="mt-6 rounded-2xl border border-black/5 p-5 text-sm text-gray-700 shadow-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">
          <p className="leading-relaxed">
            The full service editor isn’t available here yet.
          </p>
          <div className="mt-3">
            <Link
              href={`/sell/service?id=${encodeURIComponent(service.id)}`}
              prefetch={false}
              className="inline-flex items-center rounded-lg bg-[#161748] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Open full editor
            </Link>
          </div>
        </section>
      )}

      {/* Tips / Help */}
      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-amber-200/50 bg-amber-50 p-4 text-amber-900 dark:border-amber-500/20 dark:bg-amber-900/20 dark:text-amber-100">
          <div className="font-semibold">Pro tip</div>
          <p className="mt-1 text-sm">
            Use clear photos (cover + 3–6 angles). Add your service area and availability for more leads.
          </p>
        </div>
        <div className="rounded-xl border border-sky-200/50 bg-sky-50 p-4 text-sky-900 dark:border-sky-500/20 dark:bg-sky-900/20 dark:text-sky-100">
          <div className="font-semibold">Need help?</div>
          <p className="mt-1 text-sm">
            Visit the{" "}
            <Link href="/help" className="underline underline-offset-4">
              Help Center
            </Link>{" "}
            or{" "}
            <Link href="/contact" className="underline underline-offset-4">
              contact support
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
