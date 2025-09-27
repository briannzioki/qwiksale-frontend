// src/app/page.tsx
export const runtime = "nodejs";
export const revalidate = 300;

import { Suspense } from "react";
import HomeClientNoSSR from "./_components/HomeClientNoSSR";

type RawSearchParams = Record<string, string | string[] | undefined>;

/** Build absolute URL on the server (works in dev and prod) */
function makeApiUrl(path: string) {
  const explicit = process.env["NEXT_PUBLIC_APP_URL"]; // unified env var
  const vercel = process.env["VERCEL_URL"];
  const base =
    explicit ||
    (vercel ? (vercel.startsWith("http") ? vercel : `https://${vercel}`) : null) ||
    "http://127.0.0.1:3000";
  return new URL(path, base);
}

/** Read a query param from URLSearchParams or a plain object */
async function readParam(
  spPromise: Promise<any> | undefined,
  key: string
): Promise<string | null> {
  if (!spPromise) return null;
  const r: any = await spPromise;

  // ReadonlyURLSearchParams / URLSearchParams
  if (r && typeof r.get === "function") {
    try {
      const v = r.get(key);
      return v == null ? null : String(v);
    } catch {
      /* fall through */
    }
  }

  // Plain object
  if (r && typeof r === "object") {
    const v = (r as RawSearchParams)[key];
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return (v[0] as string) ?? null;
  }

  return null;
}

export default async function HomePage({
  // Accept MaybePromise or plain object; don't import Next's PageProps
  searchParams,
}: {
  searchParams: Promise<any>;
}) {
  const rawT = ((await readParam(searchParams, "t")) ?? "all").toLowerCase();
  const isAll = rawT !== "products" && rawT !== "services";
  const t = (isAll ? "all" : (rawT as "products" | "services"));

  // Always call /api/home-feed for the chosen tab
  const params = new URLSearchParams();
  params.set("limit", "24");
  params.set("pageSize", "24");
  if (t !== "all") {
    params.set("t", t);
    params.set("facets", "true");
  }

  // Warm the tag cache; ignore failures (doesn't block page render)
  try {
    await fetch(makeApiUrl(`/api/home-feed?${params.toString()}`), {
      next: { tags: ["home-feed", `home-feed:${t}`] },
    });
  } catch {
    /* ignore prefetch failure */
  }

  return (
    <main className="min-h-dvh">
      <Suspense fallback={<div className="p-6 text-sm opacity-70">Loading…</div>}>
        <HomeClientNoSSR />
      </Suspense>
    </main>
  );
}
