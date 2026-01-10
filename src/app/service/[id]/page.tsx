export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";

import { makeApiUrl } from "@/app/lib/url";
import ServicePageClient from "./ServicePageClient";
import type { ServiceWire } from "./ServicePageClient";

function isActiveListing(raw: unknown): boolean {
  const s = String((raw as any)?.status ?? "").trim();
  if (!s) return true;
  return s.toUpperCase() === "ACTIVE";
}

async function buildForwardHeaders(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};

  // Forward cookies for owner/admin views when calling internal APIs from the server.
  try {
    const jar = await cookies();
    const all = jar.getAll();

    const parts: string[] = [];
    for (const c of all) {
      const name = typeof (c as any)?.name === "string" ? String((c as any).name) : "";
      const value = typeof (c as any)?.value === "string" ? String((c as any).value) : "";
      if (name) parts.push(`${name}=${value}`);
    }

    const cookieHeader = parts.join("; ").trim();
    if (cookieHeader) out["Cookie"] = cookieHeader;
  } catch {
    // ignore: if called outside a request context, we just don't forward cookies
  }

  // Forward authorization header if present (rare, but keep it).
  try {
    const h = await headers();
    const authz = h.get("authorization");
    if (authz && authz.trim()) out["Authorization"] = authz.trim();
  } catch {
    // ignore
  }

  return out;
}

async function fetchAsJson(
  url: string,
  init: RequestInit,
): Promise<{ res: Response | null; json: any | null }> {
  try {
    const res = await fetch(url, init);
    const json = await res.json().catch(() => null);
    return { res, json };
  } catch {
    return { res: null, json: null };
  }
}

async function fetchInitialService(
  id: string,
): Promise<{ service: ServiceWire | null; status: number }> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const forward = await buildForwardHeaders();

  const tryFallbackList = async (): Promise<ServiceWire | null> => {
    const listUrl = makeApiUrl(`/api/services?ids=${encodeURIComponent(id)}`);
    const { res: altRes, json: altJson } = await fetchAsJson(listUrl, {
      cache: "no-store",
      headers: { Accept: "application/json", ...forward },
      ...(controller ? { signal: controller.signal } : {}),
    });

    const j = (altJson || {}) as any;

    const cand = Array.isArray(j?.items)
      ? (j.items.find((x: any) => String(x?.id) === String(id)) as ServiceWire | undefined)
      : null;
    if (cand) return cand;

    // Back-compat: accept { services: [...] } if an older shape ever appears.
    const cand2 = Array.isArray(j?.services)
      ? (j.services.find((x: any) => String(x?.id) === String(id)) as ServiceWire | undefined)
      : null;
    if (cand2) return cand2;

    // Worst-case: single object payload (unexpected), accept if id matches.
    if (j && typeof j === "object" && String((j as any)?.id) === String(id)) {
      return j as ServiceWire;
    }

    const st = typeof altRes?.status === "number" ? altRes.status : 0;
    if (st === 404) return null;

    return null;
  };

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
    const { res, json } = await fetchAsJson(url, {
      cache: "no-store",
      headers: { Accept: "application/json", ...forward },
      ...(controller ? { signal: controller.signal } : {}),
    });

    const status = typeof res?.status === "number" ? res.status : 0;

    // When detail fetch fails (missing/unauthorized/timeout/non-OK), try list fallback.
    if (!res || !res.ok) {
      const cand = await tryFallbackList();
      if (cand) return { service: cand, status: 200 };
      return { service: null, status: status || 0 };
    }

    const j = (json || {}) as any;
    const wire = ((j.service ?? j) || null) as ServiceWire | null;

    if (!wire) {
      const cand = await tryFallbackList();
      if (cand) return { service: cand, status: 200 };
      return { service: null, status: status || 0 };
    }

    return { service: wire, status };
  } catch {
    const cand = await tryFallbackList();
    if (cand) return { service: cand, status: 200 };
    return { service: null, status: 0 };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

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

  // prevent “soft 404”: inactive listings should be noindex and 404 at page render
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

  // prevent “soft 404”: inactive listings must be real 404
  if (!isActiveListing(service)) notFound();

  return (
    <main className="container-page space-y-4 py-4 sm:space-y-6 sm:py-6">
      <ServicePageClient id={cleanId} initialData={service} />
    </main>
  );
}
