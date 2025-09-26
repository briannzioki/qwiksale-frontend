// src/app/page.tsx
export const runtime = "nodejs";
// Enable caching so next.tags actually matter
export const revalidate = 300;

import { Suspense } from "react";
import HomeClientNoSSR from "./_components/HomeClientNoSSR";

type SearchParams =
  | { [key: string]: string | string[] | undefined }
  | URLSearchParams;

/** Build absolute URL on the server (works in dev and prod) */
function makeApiUrl(path: string) {
  const explicit = process.env['NEXT_PUBLIC_SITE_URL'];
  const vercel = process.env['VERCEL_URL'];
  const base =
    explicit ||
    (vercel ? (vercel.startsWith("http") ? vercel : `https://${vercel}`) : null) ||
    "http://127.0.0.1:3000";
  return new URL(path, base);
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) as SearchParams | undefined;

  const t =
    (sp &&
      (sp instanceof URLSearchParams
        ? sp.get("t")
        : typeof (sp as any)["t"] === "string"
        ? ((sp as any)["t"] as string)
        : Array.isArray((sp as any)["t"])
        ? ((sp as any)["t"][0] as string)
        : null)) || "all";

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
    // ignore prefetch failures; the client will still fetch.
  }

  return (
    <main className="min-h-dvh">
      <Suspense fallback={<div className="p-6 text-sm opacity-70">Loading…</div>}>
        <HomeClientNoSSR />
      </Suspense>
    </main>
  );
}
