export const runtime = "nodejs";
export const revalidate = 300;

import { Suspense } from "react";
import HomeClientNoSSR from "./_components/HomeClientNoSSR";
import { makeApiUrl } from "@/app/lib/url";

type RawSearchParams = Record<string, string | string[] | undefined>;

/** Read a query param from URLSearchParams or a plain object */
async function readParam(
  spMaybe: Promise<RawSearchParams> | RawSearchParams | undefined,
  key: string
): Promise<string | null> {
  if (!spMaybe) return null;
  const r: any = await spMaybe;

  // ReadonlyURLSearchParams / URLSearchParams
  if (r && typeof r.get === "function") {
    try {
      const v = r.get(key);
      return typeof v === "string" ? v : v == null ? null : String(v);
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
  // Next 15 can deliver either a ReadonlyURLSearchParams-like object or a plain record,
  // and some setups make it a Promise at render time. Accept `any` to be robust.
  searchParams,
}: {
  searchParams?: Promise<RawSearchParams> | RawSearchParams;
}) {
  const t = normalizeMode(await readParam(searchParams, "t"));

  // Always call /api/home-feed for the chosen tab
  const params = new URLSearchParams();
  params.set("limit", "24");
  params.set("pageSize", "24");
  if (!isAll) {
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
