export const runtime = "nodejs";
export const revalidate = 300;

import { Suspense } from "react";
import HomeClientNoSSR from "./_components/HomeClientNoSSR";

/** Build absolute URL on the server (works in dev and prod) */
function makeApiUrl(path: string) {
  const explicit = process.env["NEXT_PUBLIC_SITE_URL"];
  const vercel = process.env["VERCEL_URL"];
  const base =
    explicit ||
    (vercel ? (vercel.startsWith("http") ? vercel : `https://${vercel}`) : null) ||
    "http://127.0.0.1:3000";
  return new URL(path, base);
}

export default async function HomePage({
  searchParams,
}: {
  // Next 15 generated types expect Promise here
  searchParams: Promise<URLSearchParams>;
}) {
  const sp = await searchParams;

  // Determine tab (omit t for "all" to keep backend happy)
  const rawT = (sp.get("t") || "all").toLowerCase();
  const isAll = rawT !== "products" && rawT !== "services";
  const t = isAll ? "all" : (rawT as "products" | "services");

  // Prefetch the API to warm the cache; include t only when not "all"
  const params = new URLSearchParams();
  params.set("limit", "24");
  params.set("pageSize", "24");
  if (!isAll) {
    params.set("t", t);
    params.set("facets", "true");
  }

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
