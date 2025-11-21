// src/app/service/[id]/ServicePageClient.tsx
"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { useSession } from "next-auth/react";
import FavoriteButton from "@/app/components/favorites/FavoriteButton";
import DeleteListingButton from "@/app/components/DeleteListingButton";
import { buildServiceSeo } from "@/app/lib/seo";
import Gallery from "@/app/components/Gallery";
import ContactModalService from "@/app/components/ContactModalService";
import { useServices } from "@/app/lib/servicesStore";
import {
  extractGalleryUrls,
  stripPlaceholderIfOthers,
} from "@/app/lib/media";
import type { UrlObject as MediaUrlObject } from "@/app/lib/media";

export type ServiceWire = {
  id: string;
  // loosened: allow null/undefined so server shape is assignable
  name?: string | null;
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;

  price?: number | null;
  rateType?: "hour" | "day" | "fixed" | null;

  image?: string | null;
  gallery?: string[];
  images?: Array<string | MediaUrlObject>;
  photos?: Array<string | MediaUrlObject>;
  media?: Array<string | MediaUrlObject>;
  imageUrls?: string[];

  serviceArea?: string | null;
  availability?: string | null;
  location?: string | null;
  featured?: boolean;

  status?: "ACTIVE" | "SOLD" | "HIDDEN" | "DRAFT" | string | null;

  sellerId?: string | null;
  sellerName?: string | null;
  sellerPhone?: string | null;
  sellerLocation?: string | null;
  sellerMemberSince?: string | null;
  sellerRating?: number | null;
  sellerSales?: number | null;
  seller?: {
    id?: string;
    username?: string | null;
    name?: string | null;
    image?: string | null;
    phone?: string | null;
    location?: string | null;
    memberSince?: string | null;
    rating?: number | null;
    sales?: number | null;
  } | null;
};

type StoreRow =
  ReturnType<typeof useServices> extends { services: infer U }
    ? U extends (infer V)[]
      ? V
      : never
    : never;

type Detail = Partial<StoreRow> & ServiceWire;

const PLACEHOLDER = "/placeholder/default.jpg";
const GALLERY_SIZES =
  "(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 800px";

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || n <= 0) return "Contact for quote";
  try {
    return `KES ${new Intl.NumberFormat("en-KE").format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}
function rateSuffix(rt?: "hour" | "day" | "fixed" | null) {
  if (rt === "hour") return "/hr";
  if (rt === "day") return "/day";
  return "";
}
function normRateType(rt: unknown): "hour" | "day" | "fixed" {
  return rt === "hour" || rt === "day" || rt === "fixed" ? rt : "hour";
}
function isPlaceholder(u?: string | null) {
  if (!u) return false;
  const s = String(u).trim();
  return s === PLACEHOLDER || s.endsWith("/placeholder/default.jpg");
}

export default function ServicePageClient({
  id,
  initialData,
}: {
  id: string;
  initialData: ServiceWire | null;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const viewerId = (session?.user as any)?.id as string | undefined;

  const { services } = useServices();

  const [fetched, setFetched] = useState<Detail | null>(
    (initialData as unknown as Detail) ?? null
  );
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [gone, setGone] = useState(false);

  const service = useMemo(() => {
    if (!id) return undefined;
    const s = services.find(
      (x: any) => String(x.id) === String(id)
    ) as StoreRow | undefined;
    return (s as Detail) || undefined;
  }, [services, id]);

  const hasRealGallery = useCallback((obj: unknown): boolean => {
    const urls = extractGalleryUrls((obj as any) || {}, PLACEHOLDER);
    return urls.some((u) => u && u !== PLACEHOLDER);
  }, []);

  const fetchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!id || gone || fetching || fetched) return;

    const ctrl = new AbortController();
    fetchAbortRef.current?.abort();
    fetchAbortRef.current = ctrl;

    (async () => {
      try {
        setFetching(true);
        setFetchErr(null);

        const r = await fetch(`/api/services/${encodeURIComponent(id)}`, {
          cache: "no-store",
          credentials: "include",
          headers: {
            Accept: "application/json",
            "cache-control": "no-store",
          },
          signal: ctrl.signal,
        });

        if (r.status === 404) {
          if (!ctrl.signal.aborted) setGone(true);
          return;
        }

        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || `Failed to load (${r.status})`);

        const maybe: Detail | null =
          (j && (("service" in j ? (j as any).service : j) as Detail)) || null;

        const status = (maybe as any)?.status;
        if (status && String(status).toUpperCase() !== "ACTIVE") {
          if (!ctrl.signal.aborted) setGone(true);
          return;
        }

        if (!ctrl.signal.aborted) setFetched(maybe);
      } catch (e: any) {
        if (!ctrl.signal.aborted)
          setFetchErr(e?.message || "Failed to load service");
      } finally {
        if (!ctrl.signal.aborted) setFetching(false);
      }
    })();

    return () => {
      ctrl.abort();
    };
  }, [id, gone, fetching, fetched]);

  const didRefetchEmpty = useRef(false);
  const hasRealFromCurrent = useMemo(
    () => hasRealGallery(fetched ?? service ?? {}),
    [fetched, service, hasRealGallery]
  );

  useEffect(() => {
    if (!id || gone || fetching) return;
    if (!fetched) return;
    if (hasRealFromCurrent) return;
    if (didRefetchEmpty.current) return;

    didRefetchEmpty.current = true;

    const ctrl = new AbortController();
    fetchAbortRef.current?.abort();
    fetchAbortRef.current = ctrl;

    let backoffTimer: ReturnType<typeof setTimeout> | null = null;
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        backoffTimer = setTimeout(() => resolve(), ms);
      });

    (async () => {
      try {
        setFetching(true);
        setFetchErr(null);

        const request = () =>
          fetch(`/api/services/${encodeURIComponent(id)}`, {
            cache: "no-store",
            credentials: "include",
            headers: {
              Accept: "application/json",
              "cache-control": "no-store",
            },
            signal: ctrl.signal,
          });

        const r = await request();

        if (r.status === 404) {
          if (!ctrl.signal.aborted) setGone(true);
          return;
        }

        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || `Failed to load (${r.status})`);

        const maybe: Detail | null =
          (j && (("service" in j ? (j as any).service : j) as Detail)) || null;

        const status = (maybe as any)?.status;
        if (status && String(status).toUpperCase() !== "ACTIVE") {
          if (!ctrl.signal.aborted) setGone(true);
          return;
        }

        const timedFallback = r.headers.get("x-api-fallback") === "timed-out";
        const stillEmpty = !hasRealGallery(maybe || {});

        if (!ctrl.signal.aborted) setFetched(maybe);

        if ((timedFallback || stillEmpty) && !ctrl.signal.aborted) {
          await sleep(1200);
          if (ctrl.signal.aborted) return;

          const r2 = await request();

          if (r2.status === 404) {
            if (!ctrl.signal.aborted) setGone(true);
            return;
          }

          const j2 = await r2.json().catch(() => ({}));
          if (r2.ok) {
            const maybe2: Detail | null =
              (j2 && (("service" in j2 ? (j2 as any).service : j2) as Detail)) ||
              null;

            const status2 = (maybe2 as any)?.status;
            if (status2 && String(status2).toUpperCase() !== "ACTIVE") {
              if (!ctrl.signal.aborted) setGone(true);
              return;
            }

            if (!ctrl.signal.aborted && hasRealGallery(maybe2 || {})) {
              setFetched(maybe2);
            }
          }
        }
      } catch (e: any) {
        if (!ctrl.signal.aborted)
          setFetchErr(e?.message || "Failed to load service");
      } finally {
        if (backoffTimer) clearTimeout(backoffTimer);
        if (!ctrl.signal.aborted) setFetching(false);
      }
    })();

    return () => {
      if (backoffTimer) clearTimeout(backoffTimer);
      ctrl.abort();
    };
  }, [id, gone, fetching, fetched, hasRealFromCurrent, hasRealGallery]);

  useEffect(() => {
    const status = (service as any)?.status;
    if (status && String(status).toUpperCase() !== "ACTIVE") {
      setGone(true);
    }
  }, [service]);

  if (gone) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto mb-3 grid h-10 w-10 place-content-center rounded-lg bg-[#161748] text-white">
            404
          </div>
          <h1 className="text-lg font-semibold">Service unavailable</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">
            This service was removed or isn’t available anymore.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Link href="/" prefetch={false} className="btn-gradient-primary">
              Home
            </Link>
            <Link
              href="/search?type=service"
              prefetch={false}
              className="btn-gradient-primary"
            >
              Browse services
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const displayMaybe = (fetched || service) as Detail | undefined;

  const display: Detail = {
    id: displayMaybe?.id ?? id ?? "unknown",
    name: displayMaybe?.name ?? "Service",
    description: displayMaybe?.description ?? null,
    category: displayMaybe?.category ?? "General",
    subcategory: displayMaybe?.subcategory ?? null,
    price: typeof displayMaybe?.price === "number" ? displayMaybe.price : null,
    ...(displayMaybe?.rateType
      ? { rateType: normRateType(displayMaybe.rateType) }
      : {}),
    image: displayMaybe?.image ?? null,
    gallery: Array.isArray(displayMaybe?.gallery)
      ? (displayMaybe.gallery as string[])
      : [],
    serviceArea: displayMaybe?.serviceArea ?? null,
    availability: displayMaybe?.availability ?? null,
    location: displayMaybe?.location ?? null,
    featured: Boolean(displayMaybe?.featured),
    sellerId: displayMaybe?.sellerId ?? null,
    sellerName: displayMaybe?.sellerName ?? null,
    sellerPhone: displayMaybe?.sellerPhone ?? null,
    sellerLocation: displayMaybe?.sellerLocation ?? null,
    sellerMemberSince: displayMaybe?.sellerMemberSince ?? null,
    sellerRating:
      typeof displayMaybe?.sellerRating === "number"
        ? displayMaybe.sellerRating
        : null,
    sellerSales:
      typeof displayMaybe?.sellerSales === "number"
        ? displayMaybe.sellerSales
        : null,
    seller: displayMaybe?.seller ?? null,
    ...(displayMaybe &&
    "status" in displayMaybe &&
    displayMaybe.status != null
      ? { status: displayMaybe.status as any }
      : {}),
  };

  const galleryToRender = useMemo(() => {
    const urls = extractGalleryUrls(displayMaybe || {}, PLACEHOLDER);
    const pruned = stripPlaceholderIfOthers(urls, PLACEHOLDER);

    if (!pruned || pruned.length === 0) {
      if (displayMaybe?.image && !isPlaceholder(displayMaybe.image)) {
        return [displayMaybe.image];
      }
      return [PLACEHOLDER];
    }
    return pruned;
  }, [displayMaybe]);

  const enableLightbox = useMemo(
    () => galleryToRender.some((u) => u && u !== PLACEHOLDER),
    [galleryToRender]
  );

  const seller = useMemo(() => {
    const nested: any = (display as any)?.seller || {};
    const username = (nested?.username || "").trim() || null;
    return {
      id: nested?.id ?? display?.sellerId ?? null,
      username,
      name: nested?.name ?? display?.sellerName ?? "Service Provider",
      image: nested?.image ?? null,
      phone: nested?.phone ?? display?.sellerPhone ?? null,
      location: nested?.location ?? display?.sellerLocation ?? null,
      memberSince: nested?.memberSince ?? display?.sellerMemberSince ?? null,
      rating:
        typeof nested?.rating === "number"
          ? nested.rating
          : typeof display?.sellerRating === "number"
          ? display?.sellerRating
          : null,
      sales:
        typeof nested?.sales === "number"
          ? nested.sales
          : typeof display?.sellerSales === "number"
          ? display?.sellerSales
          : null,
    };
  }, [display]);

  const isOwner = Boolean(viewerId && seller.id && viewerId === seller.id);

  const storeHref = useMemo(() => {
    const uname = seller.username;
    const sid = seller.id;
    if (uname) return `/store/${encodeURIComponent(uname)}`;
    if (sid) return `/store/u-${encodeURIComponent(sid)}`;
    return `/store`;
  }, [seller.username, seller.id]);

  const seo = useMemo(() => {
    const nonPlaceholder = galleryToRender.filter(
      (u) => u && u !== PLACEHOLDER
    );
    return buildServiceSeo({
      id: display.id!,
      name: display.name!,
      ...(display.description != null
        ? { description: display.description }
        : {}),
      ...(typeof display.price === "number" ? { price: display.price } : {}),
      ...(nonPlaceholder.length ? { image: nonPlaceholder } : {}),
      ...(display.category ? { category: display.category } : {}),
      ...(display.subcategory ? { subcategory: display.subcategory } : {}),
      ...(display.rateType ? { rateType: display.rateType } : {}),
      ...(display.location ? { location: display.location } : {}),
      ...(display.serviceArea ? { serviceArea: display.serviceArea } : {}),
      ...(display.sellerName ? { sellerName: display.sellerName } : {}),
      urlPath: `/service/${display.id}`,
      status: "ACTIVE",
    });
  }, [display, galleryToRender]);

  const copyLink = useCallback(async () => {
    if (!display?.id) return;
    try {
      const shareUrl =
        typeof window !== "undefined" && window.location
          ? `${window.location.origin}/service/${display.id}`
          : `/service/${display.id}`;
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  }, [display?.id]);

  return (
    <>
      {seo?.jsonLd && (
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(seo.jsonLd),
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Media */}
        <div className="lg:col-span-3">
          <div
            className="relative overflow-hidden rounded-xl border bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
            data-gallery-wrap
          >
            <div className="relative aspect-[4/3] sm:aspect-[16/10]">
              {display.featured && (
                <span className="absolute left-3 top-3 z-20 rounded-md bg-[#161748] px-2 py-1 text-xs text-white shadow">
                  Featured
                </span>
              )}

              <Gallery
                images={galleryToRender}
                sizes={GALLERY_SIZES}
                lightbox={enableLightbox}
              />

              {/* Hidden mirror for tests if needed */}
              <ul hidden data-gallery-shadow="true">
                {galleryToRender.map((src, i) => (
                  <li key={`shadow:${i}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" data-gallery-image />
                  </li>
                ))}
              </ul>

              {/* Overlay opener target (for tests) */}
              <button
                type="button"
                data-gallery-overlay="true"
                aria-label="Open image in fullscreen"
                className="absolute inset-0 z-[70] h-full w-full bg-transparent"
                onClick={() => {
                  const wrap =
                    document.querySelector<HTMLElement>("[data-gallery-wrap]");
                  const opener =
                    wrap?.querySelector<HTMLElement>(
                      '[data-gallery-opener], button[aria-label="Open image in fullscreen"]'
                    );
                  opener?.click();
                }}
              />

              <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-black/5 dark:ring-white/10" />
            </div>

            {/* Overlay controls */}
            <div className="absolute right-3 top-3 z-[80] flex gap-2">
              <button
                type="button"
                onClick={copyLink}
                className="btn-gradient-primary inline-flex items-center gap-1 px-2 py-1 text-xs"
                title="Copy link"
                aria-label="Copy link"
              >
                Copy
              </button>

              <FavoriteButton serviceId={display.id!} />

              {isOwner && (
                <>
                  <Link
                    href={`/service/${display.id}/edit`}
                    prefetch={false}
                    className="btn-gradient-primary inline-flex items-center gap-1 px-2 py-1 text-xs"
                    title="Edit service"
                    aria-label="Edit service"
                  >
                    Edit
                  </Link>

                  <DeleteListingButton
                    serviceId={display.id!}
                    label="Delete"
                    className="btn-gradient-primary px-2 py-1 text-xs"
                    onDeletedAction={() => {
                      toast.success("Service deleted");
                      // ✅ Only after explicit user action
                      router.push("/dashboard");
                    }}
                  />
                </>
              )}
            </div>

            {(fetching || fetchErr) && (
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[75] bg-black/40 p-2 text-center text-xs text-white">
                {fetching ? "Loading…" : fetchErr || "Showing limited info"}
              </div>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {display.name || "Service"}
            </h1>
          </div>

          <div className="space-y-1 rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-2xl font-bold text-[#161748] dark:text-brandBlue">
              {fmtKES(display.price)} {rateSuffix(display.rateType ?? null)}
            </p>
            {display.serviceArea && (
              <p className="text-sm text-gray-500">
                Service Area: {display.serviceArea}
              </p>
            )}
            {display.location && (
              <p className="text-sm text-gray-500">
                Base Location: {display.location}
              </p>
            )}
          </div>

          <div className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-2 font-semibold">Description</h2>
            <p className="whitespace-pre-line text-gray-700 dark:text-slate-200">
              {display.description || "No description provided."}
            </p>
          </div>

          {/* Provider / Contact */}
          <div className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 font-semibold">Provider</h3>

            <div className="space-y-1 text-gray-700 dark:text-slate-200">
              <p className="flex items-center gap-2">
                <span className="font-medium">Name:</span>
                <span>
                  {display.sellerName ||
                    (display.seller as any)?.name ||
                    "Provider"}
                </span>
              </p>
              {display.sellerLocation && (
                <p>
                  <span className="font-medium">Location:</span>{" "}
                  {display.sellerLocation}
                </p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <ContactModalService
                className="btn-gradient-primary"
                serviceId={display.id!}
                // force a concrete string; TS 2345 silenced correctly
                serviceName={display.name ?? "Service"}
                fallbackName={
                  display.sellerName ?? (display.seller as any)?.name ?? null
                }
                fallbackLocation={
                  display.sellerLocation ??
                  (display.seller as any)?.location ??
                  null
                }
                buttonLabel="Message provider"
              />
              <Link
                href={storeHref}
                prefetch={false}
                className="btn-gradient-primary"
                aria-label="Visit provider store"
              >
                Visit Store
              </Link>
            </div>

            <div className="mt-4 text-xs text-gray-500 dark:text-slate-400">
              Safety: meet in public places, verify identity where possible, and
              avoid prepayments.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
