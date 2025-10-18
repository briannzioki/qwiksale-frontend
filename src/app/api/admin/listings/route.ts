export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { assertAdmin } from "../_lib/guard";
import { withApiLogging, type RequestLog } from "@/app/lib/api-logging";

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

function noStoreJson(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
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
  return [{ createdAt: "desc" as const }, { id: "desc" as const }];
}

function parseBool(v: string | null): boolean | undefined {
  if (v == null) return undefined;
  const t = v.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(t)) return true;
  if (["0", "false", "no", "off"].includes(t)) return false;
  return undefined;
}

export async function GET(req: NextRequest) {
  const denied = await assertAdmin();
  if (denied) return denied;

  return withApiLogging(req, "/api/admin/listings", async (log: RequestLog) => {
    try {
      const url = new URL(req.url);

      const q = (url.searchParams.get("q") || "").trim();
      // accept both ?type= and ?kind= (client sends "type")
      const type = (url.searchParams.get("type") || url.searchParams.get("kind") || "").trim().toLowerCase();
      const status = normStatus(url.searchParams.get("status"));
      const featured = parseBool(url.searchParams.get("featured"));
      const sort = url.searchParams.get("sort");
      const limit = toInt(url.searchParams.get("limit"), 200, 1, 500);
      const page = toInt(url.searchParams.get("page"), 1, 1, 1000);
      const skip = (page - 1) * limit;

      const wantsProduct = !type || type === "product";
      const wantsService = !type || type === "service";
      const split = wantsProduct && wantsService ? Math.max(1, Math.floor(limit / 2)) : limit;
      const takeProducts = wantsProduct ? split : 0;
      const takeServices = wantsService ? limit - takeProducts : 0;

      const baseWhere: any = {};
      if (status) baseWhere.status = status;
      if (typeof featured === "boolean") baseWhere.featured = featured;
      if (q) {
        baseWhere.OR = [
          { name: { contains: q, mode: "insensitive" } },
          { sellerName: { contains: q, mode: "insensitive" } } as any,
        ];
      }
      const orderBy = buildOrder(sort);

      const productSelect = {
        id: true,
        name: true,
        price: true,
        featured: true,
        createdAt: true,
        sellerId: true as any,
        sellerName: true as any,
        seller: { select: { id: true, name: true } },
      };

      const anyPrisma = prisma as any;
      const serviceModel =
        anyPrisma.service ??
        anyPrisma.services ??
        anyPrisma.Service ??
        anyPrisma.Services ??
        null;

      const [productTotal, serviceTotal] = await Promise.all([
        prisma.product.count({ where: baseWhere }).catch(() => 0),
        serviceModel?.count ? serviceModel.count({ where: baseWhere }).catch(() => 0) : Promise.resolve(0),
      ]);

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
          createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt ? String(p.createdAt) : null,
          sellerName: (p.sellerName as string) ?? p.seller?.name ?? null,
          sellerId: (p.sellerId as string) ?? p.seller?.id ?? null,
        })),
        ...serviceRows.map((s: any) => ({
          id: String(s.id),
          kind: "service" as const,
          name: String(s.name ?? ""),
          price: typeof s.price === "number" ? s.price : null,
          featured: typeof s.featured === "boolean" ? s.featured : null,
          createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt ? String(s.createdAt) : null,
          sellerName: (s.sellerName as string) ?? s.seller?.name ?? null,
          sellerId: (s.sellerId as string) ?? s.seller?.id ?? null,
        })),
      ];

      const combinedTotal = (wantsProduct ? productTotal : 0) + (wantsService ? serviceTotal : 0);

      log.info(
        { returned: rows.length, page, limit, productTotal, serviceTotal, combinedTotal, type: type || "both" },
        "admin_listings_ok",
      );

      const res = noStoreJson(rows);
      res.headers.set("X-Total-Count", String(combinedTotal));
      res.headers.set("X-Product-Total", String(productTotal));
      res.headers.set("X-Service-Total", String(serviceTotal));
      res.headers.set("X-Page", String(page));
      res.headers.set("X-Per-Page", String(limit));
      return res;
    } catch (err) {
      console.error("[/api/admin/listings GET] error:", err);
      return noStoreJson({ error: "Server error" }, { status: 500 });
    }
  });
}
