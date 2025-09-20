export const preferredRegion = ['fra1'];
// src/app/api/admin/listings/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { assertAdmin } from "../_lib/guard";
import { withApiLogging, type RequestLog } from "@/app/lib/api-logging";

/* -------------------------------- types -------------------------------- */
type Row = {
  id: string;
  kind: "product" | "service";
  name: string;
  price: number | null;
  featured: boolean | null;
  createdAt: string | null;
  sellerName: string | null;
  sellerId: string | null;
};

/* ----------------------------- tiny helpers ----------------------------- */
function noStoreJson(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function toInt(v: string | null, def: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normStatus(v: string | null): "ACTIVE" | "SOLD" | "HIDDEN" | "DRAFT" | undefined {
  const t = (v || "").trim().toUpperCase();
  return ["ACTIVE", "SOLD", "HIDDEN", "DRAFT"].includes(t) ? (t as any) : undefined;
}

function buildOrder(sort: string | null) {
  const t = (sort || "").toLowerCase();
  if (t === "price_asc") return [{ price: "asc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }];
  if (t === "price_desc") return [{ price: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }];
  if (t === "featured") return [{ featured: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }];
  return [{ createdAt: "desc" as const }, { id: "desc" as const }]; // newest
}

/* ---------------------------------- GET --------------------------------- */
export async function GET(req: NextRequest) {
  const denied = await assertAdmin();
  if (denied) return denied;

  return withApiLogging(req, "/api/admin/listings", async (log: RequestLog) => {
    try {
      const url = new URL(req.url);

      const q = (url.searchParams.get("q") || "").trim();
      const kind = (url.searchParams.get("kind") || "").trim().toLowerCase(); // "", "product", "service"
      const status = normStatus(url.searchParams.get("status")); // default undefined = any
      const sort = url.searchParams.get("sort"); // "newest" (default) | "price_asc" | "price_desc" | "featured"
      const limit = toInt(url.searchParams.get("limit"), 200, 1, 500);
      const page = toInt(url.searchParams.get("page"), 1, 1, 1000);
      const skip = (page - 1) * limit;

      // Split the requested page budget across product/service fairly.
      const wantsProduct = !kind || kind === "product";
      const wantsService = !kind || kind === "service";
      const half = Math.max(1, Math.floor(limit / (wantsProduct && wantsService ? 2 : 1)));
      const takeProducts = wantsProduct ? half : 0;
      const takeServices = wantsService ? limit - takeProducts : 0;

      // Shared "where" builder
      const baseWhere: any = {};
      if (status) baseWhere.status = status;
      if (q) {
        baseWhere.OR = [
          { name: { contains: q, mode: "insensitive" } },
          { sellerName: { contains: q, mode: "insensitive" } } as any,
        ];
      }
      const orderBy = buildOrder(sort);

      // Product query (always exists)
      const productSelect = {
        id: true,
        name: true,
        price: true,
        featured: true,
        createdAt: true,
        sellerId: true as any,   // tolerate schema variants
        sellerName: true as any, // tolerate schema variants
        seller: { select: { id: true, name: true } },
      };

      // Service model might not exist — detect at runtime
      const anyPrisma = prisma as any;
      const serviceModel =
        anyPrisma.service ??
        anyPrisma.services ??
        anyPrisma.Service ??
        anyPrisma.Services ??
        null;

      // Counts (for headers)
      const [productTotal, serviceTotal] = await Promise.all([
        prisma.product.count({ where: baseWhere }).catch(() => 0),
        serviceModel?.count ? serviceModel.count({ where: baseWhere }).catch(() => 0) : Promise.resolve(0),
      ]);

      // Pagination per kind (apply same skip for both so pages are stable by kind)
      const [productRows, serviceRows] = await Promise.all([
        wantsProduct
          ? prisma.product.findMany({
              where: baseWhere,
              orderBy,
              skip,
              take: takeProducts,
              select: productSelect,
            })
          : Promise.resolve([] as any[]),
        wantsService && serviceModel?.findMany
          ? serviceModel.findMany({
              where: baseWhere,
              orderBy,
              skip,
              take: takeServices,
              select: {
                id: true,
                name: true,
                price: true,
                featured: true,
                createdAt: true,
                sellerId: true as any,
                sellerName: true as any,
                seller: { select: { id: true, name: true } },
              },
            })
          : Promise.resolve([] as any[]),
      ]);

      const rows: Row[] = [
        ...productRows.map((p: any) => ({
          id: String(p.id),
          kind: "product" as const,
          name: String(p.name ?? ""),
          price: typeof p.price === "number" ? p.price : null,
          featured: typeof p.featured === "boolean" ? p.featured : null,
          createdAt:
            p.createdAt instanceof Date
              ? p.createdAt.toISOString()
              : p.createdAt
              ? String(p.createdAt)
              : null,
          sellerName: (p.sellerName as string) ?? p.seller?.name ?? null,
          sellerId: (p.sellerId as string) ?? p.seller?.id ?? null,
        })),
        ...serviceRows.map((s: any) => ({
          id: String(s.id),
          kind: "service" as const,
          name: String(s.name ?? ""),
          price: typeof s.price === "number" ? s.price : null,
          featured: typeof s.featured === "boolean" ? s.featured : null,
          createdAt:
            s.createdAt instanceof Date
              ? s.createdAt.toISOString()
              : s.createdAt
              ? String(s.createdAt)
              : null,
          sellerName: (s.sellerName as string) ?? s.seller?.name ?? null,
          sellerId: (s.sellerId as string) ?? s.seller?.id ?? null,
        })),
      ];

      const combinedTotal =
        (wantsProduct ? productTotal : 0) + (wantsService ? serviceTotal : 0);

      log.info(
        {
          returned: rows.length,
          page,
          limit,
          productTotal,
          serviceTotal,
          combinedTotal,
          kind: kind || "both",
          hasServiceModel: Boolean(serviceModel),
        },
        "admin_listings_ok",
      );

      const res = noStoreJson(rows);
      res.headers.set("X-Total-Count", String(combinedTotal));
      res.headers.set("X-Product-Total", String(productTotal));
      res.headers.set("X-Service-Total", String(serviceTotal));
      res.headers.set("X-Page", String(page));
      res.headers.set("X-Per-Page", String(limit));
      res.headers.set("Vary", "Accept-Encoding");
      return res;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[/api/admin/listings GET] error:", err);
      return noStoreJson({ error: "Server error" }, { status: 500 });
    }
  });
}
