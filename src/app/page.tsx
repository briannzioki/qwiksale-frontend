// src/app/page.tsx
export const runtime = "nodejs";
export const revalidate = 300;

import { Suspense } from "react";
import HomeClientNoSSR from "./_components/HomeClientNoSSR";

type SearchParams =
  | Record<string, string | string[] | undefined>
  | URLSearchParams;

/** Absolute origin for server-side fetches */
function makeApiUrl(path: string) {
  const site = process.env['NEXT_PUBLIC_SITE_URL'];
  const vercel = process.env['VERCEL_URL'];

  const origin = site && site.startsWith("http")
    ? site
    : vercel
    ? (vercel.startsWith("http") ? vercel : `https://${vercel}`)
    : "http://127.0.0.1:3000";

  return new URL(path, origin);
}

function getParam(sp: SearchParams | undefined, key: string): string | null {
  if (!sp) return null;
  if (sp instanceof URLSearchParams) return sp.get(key);
  const v = sp[key]; // <-- bracket access avoids TS4111
  if (Array.isArray(v)) return v[0] ?? null;
  return typeof v === "string" ? v : null;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  // Warm a tagged cache entry; the client still drives the UI.
  const rawT = (getParam(searchParams, "t") || "").toLowerCase();
  const t = rawT === "products" || rawT === "services" ? rawT : "all";

  const params = new URLSearchParams({
    t,
    limit: "24",
    facets: "true",
  });

  try {
    await fetch(makeApiUrl(`/api/home-feed?${params.toString()}`), {
      next: { tags: ["home-feed", `home-feed:${t}`] },
    });
  } catch {
    // ignore: client will fetch anyway
  }

  return (
    <main className="min-h-dvh">
      <Suspense fallback={<div className="p-6 text-sm opacity-70">Loading…</div>}>
        <HomeClientNoSSR />
      </Suspense>
    </main>
  );
}
