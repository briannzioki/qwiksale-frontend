// src/app/service/[id]/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { makeApiUrl } from "@/app/lib/url";
import ServicePageClient from "./ServicePageClient";
import type { ServiceWire } from "./ServicePageClient";

/* ------------------------------ Data fetch ----------------------------- */

async function fetchInitialService(
  id: string,
): Promise<{ service: ServiceWire | null; status: number }> {
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

  return (
    <main className="container-page space-y-6 py-6">
      {/* Hand off to client: uses `id` as listingId for reviews. */}
      <ServicePageClient id={id} initialData={service} />
    </main>
  );
}

export const metadata: Metadata = {
  robots: { index: true, follow: true },
};
