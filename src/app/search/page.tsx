export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import SearchClient from "./SearchClient";

type SearchParams = Record<string, string | string[] | undefined>;

function first(sp: SearchParams, key: string): string {
  const v = sp?.[key];
  if (Array.isArray(v)) return String(v[0] ?? "");
  if (typeof v === "string") return v;
  return "";
}

function hasAnyQuery(sp: SearchParams): boolean {
  for (const [, v] of Object.entries(sp || {})) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      if (v.some((x) => String(x ?? "").trim() !== "")) return true;
      continue;
    }
    if (String(v).trim() !== "") return true;
  }
  return false;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}): Promise<Metadata> {
  const sp = (await (searchParams ?? Promise.resolve({} as SearchParams))) || {};

  // Index ONLY the clean /search landing page (no querystring).
  const anyQuery = hasAnyQuery(sp);

  const q = first(sp, "q").trim();
  const type =
    first(sp, "type").toLowerCase() === "service" ? "service" : "product";

  const title =
    q && q.trim()
      ? `${type === "service" ? "Search services" : "Search"}: “${q}” · QwikSale`
      : "Search · QwikSale";

  return {
    title,
    description: "Search products and services on QwikSale - filters update the URL.",
    alternates: { canonical: "/search" },
    robots: anyQuery
      ? { index: false, follow: true }
      : { index: true, follow: true },
  };
}

export default function Page() {
  // Client UI reads URL params and fetches results as before.
  return <SearchClient />;
}
