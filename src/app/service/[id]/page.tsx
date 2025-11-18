export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import Gallery from "@/app/components/Gallery";
import ProductActions from "@/app/components/ProductActions";
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

  return (
    <main className="container-page space-y-5 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{title}</h1>
        <Link
          href={storeHref}
          prefetch={false}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
          aria-label="Visit store"
          data-testid="visit-store-link"
        >
          Visit store
        </Link>
      </div>

      <div className="space-x-3 text-sm text-gray-600 dark:text-slate-300">
        <span>
          ID:{" "}
          <code className="font-mono" data-testid="service-id">
            {id}
          </code>
        </span>
        <span>Rate: {rateText}</span>
        {service?.location && <span>Location: {service.location}</span>}
      </div>

      {/* Wrap the gallery so tests can target [data-gallery-wrap]; keep an overlay target */}
      <div className="relative" data-gallery-wrap>
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

          <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-black/5 dark:ring-white/10" />
        </div>
      </div>

      {service?.description && (
        <section className="prose prose-sm max-w-none dark:prose-invert">
          <p>{service.description}</p>
        </section>
      )}

      <section className="mt-4 flex flex-wrap items-center gap-3">
        <ContactModalService
          serviceId={service?.id || id}
          {...(service?.name ? { serviceName: service.name } : {})}
          {...(service?.provider?.name
            ? { fallbackName: service.provider.name }
            : {})}
          {...(service?.location ? { fallbackLocation: service.location } : {})}
          buttonLabel="Message provider"
          className="min-w-[170px]"
        />
        <Link
          href={storeHref}
          prefetch={false}
          className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
        >
          Visit store
        </Link>
      </section>

      <ProductActions kind="service" id={service?.id || id} storeHref={storeHref} />
    </main>
  );
}

export const metadata: Metadata = {
  robots: { index: true, follow: true },
};
