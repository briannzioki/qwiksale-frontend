export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { makeApiUrl } from "@/app/lib/url";
import ServicePageClient from "./ServicePageClient";
import type { ServiceWire } from "./ServicePageClient";

/* ------------------------------ Data fetch ----------------------------- */

function isActiveListing(raw: unknown): boolean {
  const s = String((raw as any)?.status ?? "").trim();
  if (!s) return true; // if API doesn't provide status, don't 404 it
  return s.toUpperCase() === "ACTIVE";
}

async function fetchInitialService(
  id: string,
): Promise<{ service: ServiceWire | null; status: number }> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
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
      const alt = await fetch(makeApiUrl(`/api/services?ids=${encodeURIComponent(id)}`), {
        cache: "no-store",
        headers: { Accept: "application/json" },
      }).catch(() => null);

      const j = ((await alt?.json().catch(() => null)) || {}) as any;
      const cand = Array.isArray(j?.items)
        ? (j.items.find((x: any) => String(x?.id) === String(id)) as ServiceWire | undefined)
        : null;

      if (cand) return { service: cand, status: 200 };
      return { service: null, status: 404 };
    }

    const j = ((await res.json().catch(() => ({}))) || {}) as any;
    const wire = ((j.service ?? j) || null) as ServiceWire | null;

    return { service: wire, status: res.status };
  } catch {
    return { service: null, status: 0 };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/* ----------------------------- Metadata (SEO) ----------------------------- */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const cleanId = String(id || "").trim();

  const canonical = cleanId ? `/service/${encodeURIComponent(cleanId)}` : "/service";

  if (!cleanId) {
    return {
      title: "Service",
      alternates: { canonical },
      robots: { index: false, follow: false, nocache: true },
    };
  }

  const { service, status } = await fetchInitialService(cleanId);

  if (!service || status === 404) {
    return {
      title: "Service not found",
      alternates: { canonical },
      robots: { index: false, follow: false, nocache: true },
    };
  }

  // ✅ prevent “soft 404”: inactive listings should be noindex and 404 at page render
  if (!isActiveListing(service)) {
    return {
      title: "Service unavailable",
      alternates: { canonical },
      robots: { index: false, follow: false, nocache: true },
    };
  }

  const anyS: any = service;
  const name = (anyS?.name ?? anyS?.title ?? "Service") as string;
  const area = (anyS?.serviceArea ?? anyS?.location ?? "") as string;

  return {
    title: String(name),
    description: [String(name), area].filter(Boolean).join(" • ").slice(0, 155),
    alternates: { canonical },
    robots: { index: true, follow: true },
  };
}

/* -------------------------------- Page --------------------------------- */

export default async function ServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cleanId = String(id || "").trim();
  if (!cleanId) notFound();

  const { service, status } = await fetchInitialService(cleanId);
  if (status === 404 || !service) notFound();

  // ✅ prevent “soft 404”: inactive listings must be real 404
  if (!isActiveListing(service)) notFound();

  return (
    <main className="container-page space-y-4 py-4 sm:space-y-6 sm:py-6">
      {/* Hand off to client: uses `id` as listingId for reviews. */}
      <ServicePageClient id={cleanId} initialData={service} />
    </main>
  );
}
