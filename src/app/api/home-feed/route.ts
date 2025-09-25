// src/app/api/home-feed/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import {
  getProductsPage,
  getServicesPage,
  type ListingQuery,
  type Mode,
} from "@/app/lib/listings";

/* -------------------- helpers -------------------- */

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
  return res;
}

function parseQuery(req: NextRequest): { mode: Mode; input: ListingQuery } {
  const sp = req.nextUrl.searchParams;

  const modeRaw = (sp.get("t") || sp.get("mode") || "products").toLowerCase();
  const mode: Mode = modeRaw === "services" ? "services" : "products";

  // strings
  const q = sp.get("q");
  const category = sp.get("category");
  const subcategory = sp.get("subcategory");
  const brand = sp.get("brand");
  const condition = sp.get("condition") as ListingQuery["condition"] | null;

  // numbers
  const minPriceStr = sp.get("minPrice");
  const maxPriceStr = sp.get("maxPrice");
  const pageStr = sp.get("page");
  const pageSizeStr = sp.get("pageSize");

  const featuredOnly = (sp.get("featured") || "false").toLowerCase() === "true";
  const includeFacets = (sp.get("facets") || "false").toLowerCase() === "true";

  const sortParam = (sp.get("sort") || "newest") as ListingQuery["sort"];
  const sort: ListingQuery["sort"] =
    sortParam === "featured" || sortParam === "price_asc" || sortParam === "price_desc"
      ? sortParam
      : "newest";

  // base object (no undefined fields)
  const input: ListingQuery = {
    featuredOnly,
    sort,
    page: Number.isFinite(Number(pageStr)) ? Number(pageStr) : 1,
    pageSize: Number.isFinite(Number(pageSizeStr)) ? Number(pageSizeStr) : 24,
    includeFacets,
  };

  // only attach keys when present/valid
  if (q) input.q = q;
  if (category) input.category = category;
  if (subcategory) input.subcategory = subcategory;
  if (brand) input.brand = brand;
  if (condition === "brand new" || condition === "pre-owned") input.condition = condition;

  const minPriceNum = Number(minPriceStr);
  if (Number.isFinite(minPriceNum)) input.minPrice = Math.round(minPriceNum);

  const maxPriceNum = Number(maxPriceStr);
  if (Number.isFinite(maxPriceNum)) input.maxPrice = Math.round(maxPriceNum);

  return { mode, input };
}

/* -------------------- GET -------------------- */

export async function GET(req: NextRequest) {
  try {
    const { mode, input } = parseQuery(req);

    const page =
      mode === "services"
        ? await getServicesPage(input)
        : await getProductsPage(input);

    return noStore(page, { status: 200 });
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error("[home-feed GET] error", e);
    return noStore({ error: e?.message || "Server error" }, { status: 500 });
  }
}

/* -------------------- OPTIONS (CORS, optional) -------------------- */

export function OPTIONS() {
  const origin =
    process.env["NEXT_PUBLIC_SITE_URL"] ??
    process.env["NEXT_PUBLIC_APP_URL"] ??
    "*";
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
