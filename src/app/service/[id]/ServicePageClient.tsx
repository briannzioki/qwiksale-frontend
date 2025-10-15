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
import { MessageProviderButton } from "@/app/components/MessageActions";
import { useServices } from "@/app/lib/servicesStore";
import { extractGalleryUrls, stripPlaceholderIfOthers } from "@/app/lib/media";
import type { UrlObject as MediaUrlObject } from "@/app/lib/media";

/* -------------------------- Wire type (exported) ------------------------- */
export type ServiceWire = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;

  price?: number | null;
  rateType?: "hour" | "day" | "fixed" | null;

  // media (various shapes tolerated)
  image?: string | null;
  gallery?: string[];
  images?: Array<string | MediaUrlObject>;
  photos?: Array<string | MediaUrlObject>;
  media?: Array<string | MediaUrlObject>;
  imageUrls?: string[];

  // meta
  serviceArea?: string | null;
  availability?: string | null;
  location?: string | null;
  featured?: boolean;

  status?: "ACTIVE" | "SOLD" | "HIDDEN" | "DRAFT" | string | null;

  // seller
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

/* -------------------------------- Types -------------------------------- */
type ServiceFromStore =
  ReturnType<typeof useServices> extends { services: infer U }
    ? U extends (infer V)[]
      ? V
      : never
    : never;

// Local detail type (kept independent of API store types)
type ServiceDetail = Partial<ServiceFromStore> & ServiceWire;

/* ------------------------------- Constants ------------------------------ */
const PLACEHOLDER = "/placeholder/default.jpg";
const GALLERY_SIZES = "(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 800px";

/* ------------------------------- Utilities ------------------------------ */
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

async function startThread(
  sellerUserId: string,
  listingType: "product" | "service",
  listingId: string,
  firstMessage?: string
) {
  try {
    const r = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ toUserId: sellerUserId, listingType, listingId, firstMessage }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.threadId) throw new Error(j?.error || "Failed to start chat");
    window.location.href = "/messages";
  } catch (e: any) {
    toast.error(e?.message || "Could not start chat");
  }
}

/* -------------------------------- Client -------------------------------- */
export default function ServicePageClient({
  id,
  initialData,
}: {
  id: string;
  initialData: ServiceWire | null;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const isAuthed = Boolean(session?.user);
  const viewerId = (session?.user as any)?.id as string | undefined;

  const { services } = useServices();

  const [fetched, setFetched] = useState<ServiceDetail | null>(
    (initialData as unknown as ServiceDetail) ?? null
  );
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [gone, setGone] = useState(!initialData);

  const [origin, setOrigin] = useState<string>("");
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  // Pull possibly shallow item from store
  const service = useMemo(() => {
    if (!id) return undefined;
    const s = services.find((x: any) => String(x.id) === String(id)) as
      | ServiceFromStore
      | undefined;
    return (s as ServiceDetail) || undefined;
  }, [services, id]);

  // --- helpers to evaluate "real gallery" (non-placeholder) ---
  const hasRealGallery = useCallback((obj: unknown): boolean => {
    const urls = extractGalleryUrls((obj as any) || {}, PLACEHOLDER);
    return urls.some((u) => u && u !== PLACEHOLDER);
  }, []);

  // Fetch detail exactly once when no data at all (no retries here)
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

        const maybe: ServiceDetail | null =
          (j && (("service" in j ? (j as any).service : j) as ServiceDetail)) || null;

        const status = (maybe as any)?.status;
        if (status && String(status).toUpperCase() !== "ACTIVE") {
          if (!ctrl.signal.aborted) setGone(true);
          return;
        }

        if (!ctrl.signal.aborted) setFetched(maybe);
      } catch (e: any) {
        if (!ctrl.signal.aborted) setFetchErr(e?.message || "Failed to load service");
      } finally {
        if (!ctrl.signal.aborted) setFetching(false);
      }
    })();

    return () => {
      ctrl.abort();
    };
  }, [id, gone, fetching, fetched]);

  // If SSR/store exists BUT gallery is empty/placeholder-only, do ONE refetch
  // and ONE backoff retry (no more). Rendering never blocks on this.
  const didRefetchEmpty = useRef(false);
  const hasRealFromCurrent = useMemo(
    () => hasRealGallery(fetched ?? service ?? {}),
    [fetched, service, hasRealGallery]
  );

  useEffect(() => {
    if (!id || gone || fetching) return;
    if (!fetched) return; // only when we already have some data
    if (hasRealFromCurrent) return; // already has real images
    if (didRefetchEmpty.current) return; // only once

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

        // First refetch
        const r = await request();

        if (r.status === 404) {
          if (!ctrl.signal.aborted) setGone(true);
          return;
        }

        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || `Failed to load (${r.status})`);

        const maybe: ServiceDetail | null =
          (j && (("service" in j ? (j as any).service : j) as ServiceDetail)) || null;

        const status = (maybe as any)?.status;
        if (status && String(status).toUpperCase() !== "ACTIVE") {
          if (!ctrl.signal.aborted) setGone(true);
          return;
        }

        const timedFallback = r.headers.get("x-api-fallback") === "timed-out";
        const stillEmpty = !hasRealGallery(maybe || {});

        if (!ctrl.signal.aborted) setFetched(maybe);

        // Backoff retry once if fallback/empty
        if ((timedFallback || stillEmpty) && !ctrl.signal.aborted) {
          await sleep(1200); // ~1.2s backoff
          if (ctrl.signal.aborted) return;

          const r2 = await request();

          if (r2.status === 404) {
            if (!ctrl.signal.aborted) setGone(true);
            return;
          }

          const j2 = await r2.json().catch(() => ({}));
          if (r2.ok) {
            const maybe2: ServiceDetail | null =
              (j2 && (("service" in j2 ? (j2 as any).service : j2) as ServiceDetail)) || null;

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
        if (!ctrl.signal.aborted) setFetchErr(e?.message || "Failed to load service");
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

  // If store says non-active, bail fast
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
            <Link href="/search?type=service" prefetch={false} className="btn-gradient-primary">
              Browse services
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Prefer: fetched detail > raw store item > minimal normalized display
  const displayMaybe = (fetched || service) as ServiceDetail | undefined;

  const display: ServiceDetail = {
    id: displayMaybe?.id ?? (id || "unknown"),
    name: displayMaybe?.name ?? "Service",
    description: displayMaybe?.description ?? null,
    category: displayMaybe?.category ?? "General",
    subcategory: displayMaybe?.subcategory ?? null,

    price: typeof displayMaybe?.price === "number" ? displayMaybe?.price : null,
    ...(displayMaybe?.rateType ? { rateType: normRateType(displayMaybe.rateType) } : {}),

    image: displayMaybe?.image ?? null,
    gallery: Array.isArray(displayMaybe?.gallery) ? (displayMaybe!.gallery as string[]) : [],

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
      typeof displayMaybe?.sellerRating === "number" ? displayMaybe?.sellerRating : null,
    sellerSales:
      typeof displayMaybe?.sellerSales === "number" ? displayMaybe?.sellerSales : null,
    seller: displayMaybe?.seller ?? null,

    ...(displayMaybe && "status" in displayMaybe && displayMaybe.status != null
      ? { status: displayMaybe.status as any }
      : {}),
  };

  /* ---------- Gallery source: ALWAYS build a non-empty array ---------- */
  const galleryToRender = useMemo(() => {
    // Extract across all tolerated shapes and prefer real images
    const urls = extractGalleryUrls(displayMaybe || {}, PLACEHOLDER);
    const pruned = stripPlaceholderIfOthers(urls, PLACEHOLDER);

    if (!pruned || pruned.length === 0) {
      // Treat `image` as a gallery fallback when it's real
      if (displayMaybe?.image && !isPlaceholder(displayMaybe.image)) {
        return [displayMaybe.image];
      }
      return [PLACEHOLDER];
    }
    return pruned;
  }, [displayMaybe]);

  // Enable lightbox only when there's at least one non-placeholder image
  const enableLightbox = useMemo(
    () => galleryToRender.some((u) => u && u !== PLACEHOLDER),
    [galleryToRender]
  );

  // Seller derived view
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
          ? display.sellerRating
          : null,
      sales:
        typeof nested?.sales === "number"
          ? nested.sales
          : typeof display?.sellerSales === "number"
          ? display.sellerSales
          : null,
    };
  }, [display]);

  const isOwner = Boolean(viewerId && seller.id && viewerId === seller.id);

  // Deterministic store slug so Visit Store always renders
  const storeSlug =
    (seller.username && seller.username.trim()) ||
    (seller.id ? `u-${String(seller.id).slice(0, 8)}` : "unknown");

  // SEO (avoid placeholder-only images)
  const seo = useMemo(() => {
    const nonPlaceholder = galleryToRender.filter((u) => u && u !== PLACEHOLDER);
    return buildServiceSeo({
      id: display.id,
      name: display.name,
      ...(display.description != null ? { description: display.description } : {}),
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
    if (!origin || !display?.id) return;
    try {
      await navigator.clipboard.writeText(`${origin}/service/${display.id}`);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  }, [origin, display?.id]);

  const onStartMessageAction = useCallback(
    async (_serviceId: string) => {
      if (!seller.id) {
        toast.error("Provider unavailable");
        return;
      }
      await startThread(
        seller.id,
        "service",
        display.id,
        `Hi ${seller.name || "there"}, I'm interested in "${display.name}".`
      );
    },
    [seller.id, seller.name, display.id, display.name]
  );

  return (
    <>
      {seo?.jsonLd && (
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(seo.jsonLd) }}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Media */}
        <div className="lg:col-span-3">
          <div
            className="relative overflow-hidden rounded-xl border bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
            data-gallery-wrap
          >
            <div className="relative aspect-[4/3] sm:aspect-[16/10]" data-gallery-overlay="true">
              {display.featured && (
                <span className="absolute left-3 top-3 z-20 rounded-md bg-[#161748] px-2 py-1 text-xs text-white shadow">
                  Featured
                </span>
              )}

              {/* Always render gallery; component ensures at least one <img> */}
              <Gallery images={galleryToRender} sizes={GALLERY_SIZES} lightbox={enableLightbox} />

              {/* Hidden mirror for tests to read exact URLs (JSON on attribute) — ALWAYS present */}
              <ul hidden data-gallery-shadow={JSON.stringify(galleryToRender)}>
                {galleryToRender.map((src, i) => (
                  <li key={`shadow:${i}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" data-gallery-image />
                  </li>
                ))}
              </ul>

              <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-black/5 dark:ring-white/10" />
            </div>

            {/* Overlay controls */}
            <div className="absolute right-3 top-3 z-[80] flex gap-2">
              <button
                type="button"
                onClick={copyLink}
                className="btn-gradient-primary px-2 py-1 text-xs inline-flex items-center gap-1"
                title="Copy link"
                aria-label="Copy link"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M10.5 13.5l3-3M7 17a4 4 0 010-6l3-3a4 4 0 016 6l-1 1"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Copy
              </button>

              <FavoriteButton serviceId={display.id} />

              {isOwner && (
                <>
                  <Link
                    href={`/service/${display.id}/edit`}
                    className="btn-gradient-primary px-2 py-1 text-xs inline-flex items-center gap-1"
                    title="Edit service"
                    aria-label="Edit service"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M4 20h4l10-10a2.828 2.828 0 10-4-4L4 16v4z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Edit
                  </Link>

                  <DeleteListingButton
                    serviceId={display.id}
                    label="Delete"
                    className="btn-gradient-primary px-2 py-1 text-xs"
                    onDeletedAction={() => {
                      toast.success("Service deleted");
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
              {fmtKES(display.price)} {rateSuffix(display.rateType)}
            </p>
            {display.serviceArea && (
              <p className="text-sm text-gray-500">Service Area: {display.serviceArea}</p>
            )}
            {display.location && (
              <p className="text-sm text-gray-500">Base Location: {display.location}</p>
            )}
          </div>

          <div className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-2 font-semibold">Description</h2>
            <p className="whitespace-pre-line text-gray-700 dark:text-slate-200">
              {display.description || "No description provided."}
            </p>
          </div>

          {/* Provider */}
          <div className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 font-semibold">Provider</h3>

            <div className="space-y-1 text-gray-700 dark:text-slate-200">
              <p className="flex items-center gap-2">
                <span className="font-medium">Name:</span>
                <span>{(display.sellerName || (display.seller as any)?.name) ?? "Provider"}</span>
                {seller.username && (
                  <Link
                    href={`/store/${seller.username}`}
                    className="text-sm text-[#39a0ca] hover:underline"
                    title={`Visit @${seller.username}'s store`}
                  >
                    @{seller.username}
                  </Link>
                )}
              </p>
              {seller.location && (
                <p>
                  <span className="font-medium">Location:</span> {seller.location}
                </p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <ContactModalService
                className="btn-gradient-primary"
                serviceId={display.id}
                serviceName={display.name}
                fallbackName={seller.name}
                fallbackLocation={seller.location}
                buttonLabel="Show Contact"
              />

              <MessageProviderButton
                serviceId={display.id}
                isAuthed={isAuthed}
                onStartMessageAction={onStartMessageAction}
                className="btn-gradient-primary"
              />

              {/* Always render Visit Store with fallback slug and stable accessible name */}
              <Link
                href={`/store/${storeSlug}`}
                className="btn-gradient-primary"
                title={`Visit @${storeSlug}'s store`}
                aria-label="Visit Store"
              >
                Visit Store
              </Link>
            </div>

            <div className="mt-4 text-xs text-gray-500 dark:text-slate-400">
              Safety: meet in public places, verify identity when possible, and avoid prepayments.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
