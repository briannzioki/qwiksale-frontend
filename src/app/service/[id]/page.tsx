export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import Gallery from "@/app/components/Gallery";
import ContactModalService from "@/app/components/ContactModalService";
import { makeApiUrl } from "@/app/lib/url";
import { extractGalleryUrls, stripPlaceholderIfOthers } from "@/app/lib/media";

/* -------------------------------- Types -------------------------------- */

type ServiceWire = {
  id: string;

  name?: string | null;
  description?: string | null;

  image?: string | null;
  images?: unknown;
  gallery?: unknown;
  photos?: unknown;
  media?: unknown;
  imageUrls?: unknown;

  price?: number | null;
  status?: string | null;
  location?: string | null;

  provider?:
    | {
        id?: string;
        username?: string | null;
        name?: string | null;
      }
    | null;

  username?: string | null;
  providerUsername?: string | null;
  store?: string | null;
  storeSlug?: string | null;
  sellerSlug?: string | null;
};

/* ------------------------------ Utilities ------------------------------ */

const PLACEHOLDER = "/placeholder/default.jpg";

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
    return "Contact for price";
  }
  try {
    return `KES ${new Intl.NumberFormat("en-KE").format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

function resolveStoreHref(s: ServiceWire | null): string {
  if (!s) return "/store/unknown";

  const username =
    s.providerUsername ||
    s.username ||
    s.provider?.username ||
    s.storeSlug ||
    s.store ||
    s.sellerSlug ||
    null;

  if (username) {
    return `/store/${encodeURIComponent(username)}`;
  }

  const id =
    s.provider?.id ||
    (s as any)?.sellerId ||
    (s as any)?.owner?.id ||
    (s as any)?.user?.id ||
    (s as any)?.vendor?.id ||
    null;

  if (id) {
    return `/store/u-${encodeURIComponent(String(id))}`;
  }

  return "/store/unknown";
}

async function fetchInitialService(
  id: string,
): Promise<{ service: ServiceWire | null; status: number }> {
  // Hard-cap the server-side wait so /service/:id can't hang forever
  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    if (controller) {
      timeoutId = setTimeout(() => {
        try {
          controller.abort();
        } catch {
          // ignore
        }
      }, 2800);
    }

    const url = makeApiUrl(`/api/services/${encodeURIComponent(id)}`);
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      ...(controller ? { signal: controller.signal } : {}),
    });

    if (res.status === 404) {
      // Fallback: try the multi-id API in case this ID only shows there
      const alt = await fetch(
        makeApiUrl(`/api/services?ids=${encodeURIComponent(id)}`),
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
        },
      ).catch(() => null);

      const j = ((await alt?.json().catch(() => null)) || {}) as any;
      const cand = Array.isArray(j?.items)
        ? (j.items.find((x: any) => String(x?.id) === String(id)) as
            | ServiceWire
            | undefined)
        : null;

      if (cand) return { service: cand, status: 200 };
      return { service: null, status: 404 };
    }

    const j = ((await res.json().catch(() => ({}))) || {}) as any;
    const wire = ((j.service ?? j) || null) as ServiceWire | null;

    return { service: wire, status: res.status };
  } catch {
    // Timeout or generic fetch error → treat as soft API failure
    return { service: null, status: 0 };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/* -------------------------------- Page --------------------------------- */

export default async function ServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id || !String(id).trim()) notFound();

  const { service, status } = await fetchInitialService(id);
  if (status === 404) notFound();

  // Derive SSR gallery and prune placeholders if there are real URLs
  const rawImages = extractGalleryUrls(
    service ?? {},
    service?.image || PLACEHOLDER,
  );
  const images = stripPlaceholderIfOthers(rawImages, PLACEHOLDER);
  const toRender = images.length ? images : [PLACEHOLDER];

  const storeHref = resolveStoreHref(service);
  const title = service?.name || "Service";
  const rateText = fmtKES(service?.price);
  const locationText = service?.location || null;

  return (
    <main className="container-page space-y-6 py-6">
      {/* Header */}
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brandBlue/80 dark:text-brandBlue">
            Service
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white">
            {title}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-slate-300">
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 font-semibold text-gray-900 dark:bg-slate-800 dark:text-slate-50">
              {rateText}
            </span>
            {locationText && (
              <span className="inline-flex items-center gap-1">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                  aria-hidden="true"
                />
                <span>{locationText}</span>
              </span>
            )}

            {/* Keep ID for tests but hide it visually */}
            <span className="sr-only" data-testid="service-id">
              {id}
            </span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Gallery */}
        <div>
          {/* Wrap the gallery so tests can target [data-gallery-wrap]; keep an overlay target */}
          <div
            className="relative overflow-hidden rounded-2xl border bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
            data-gallery-wrap
          >
            <div
              className="relative aspect-[4/3] sm:aspect-[16/10]"
              data-gallery-overlay="true"
            >
              <Gallery
                images={toRender}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 70vw, 960px"
              />

              {/* Hidden mirror so tests can read actual src/currentSrc */}
              <ul hidden data-gallery-shadow="true">
                {toRender.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <li key={`shadow:${i}`}>
                    <img src={src} alt="" data-gallery-image />
                  </li>
                ))}
              </ul>

              <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-black/5 dark:ring-white/10" />
            </div>
          </div>
        </div>

        {/* Side panels */}
        <div className="space-y-4">
          {/* Description */}
          <section className="rounded-xl border bg-white p-4 text-sm text-gray-700 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
              Description
            </h2>
            <p className="whitespace-pre-line">
              {service?.description || "No description provided yet."}
            </p>
          </section>

          {/* Contact */}
          <section className="rounded-xl border bg-white p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
              Talk to the provider
            </h2>
            <p className="mb-3 text-xs text-gray-500 dark:text-slate-400">
              Ask about availability, pricing, and any special requirements
              before you book.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <ContactModalService
                serviceId={service?.id || id}
                {...(service?.name ? { serviceName: service.name } : {})}
                {...(service?.provider?.name
                  ? { fallbackName: service.provider.name }
                  : {})}
                {...(service?.location
                  ? { fallbackLocation: service.location }
                  : {})}
                buttonLabel="Message provider"
                className="btn-gradient-primary"
              />

              <Link
                href={storeHref}
                prefetch={false}
                className="btn-outline"
                aria-label="Visit store"
                data-testid="visit-store-link"
              >
                Visit store
              </Link>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

export const metadata: Metadata = {
  robots: { index: true, follow: true },
};
