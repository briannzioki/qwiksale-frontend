// src/app/api/admin/listings/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { assertAdmin } from "../_lib/guard";
import { withApiLogging, type RequestLog } from "@/app/lib/api-logging";

export const dynamic = "force-dynamic";

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

export async function GET(req: NextRequest) {
  const denied = await assertAdmin();
  if (denied) return denied;

  return withApiLogging(req, "/api/admin/listings", async (log: RequestLog) => {
    const url = new URL(req.url);
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 200)));

    // Always available in your schema
    const productRows = await prisma.product.findMany({
      take: Math.floor(limit / 2),
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        price: true,
        featured: true,
        createdAt: true,
        // adjust these two if your Product schema uses different field names
        sellerId: true as any,
        sellerName: true as any,
      },
    });

    // Your Prisma client currently has no `service` model property, so we
    // try to find a compatible model at runtime and fallback to [] if missing.
    const anyPrisma = prisma as any;
    const serviceModel =
      anyPrisma.service ??
      anyPrisma.services ??
      anyPrisma.Service ??
      anyPrisma.Services ??
      null;

    let serviceRows: any[] = [];
    if (serviceModel && typeof serviceModel.findMany === "function") {
      serviceRows = await serviceModel.findMany({
        take: Math.ceil(limit / 2),
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          price: true,
          featured: true,
          createdAt: true,
          // adjust if your Service-like model uses different field names
          sellerId: true as any,
          sellerName: true as any,
        },
      });
    } else {
      // No service model in this schema — return only products
      log.warn({ models: Object.keys(anyPrisma) }, "admin_listings_no_service_model");
    }

    const rows: Row[] = [
      ...productRows.map((p: any) => ({
        id: p.id as string,
        kind: "product" as const,
        name: p.name as string,
        price: typeof p.price === "number" ? (p.price as number) : null,
        featured: typeof p.featured === "boolean" ? (p.featured as boolean) : null,
        createdAt: p.createdAt ? new Date(p.createdAt as Date).toISOString() : null,
        sellerName: (p.sellerName as string) ?? null,
        sellerId: (p.sellerId as string) ?? null,
      })),
      ...serviceRows.map((s: any) => ({
        id: s.id as string,
        kind: "service" as const,
        name: s.name as string,
        price: typeof s.price === "number" ? (s.price as number) : null,
        featured: typeof s.featured === "boolean" ? (s.featured as boolean) : null,
        createdAt: s.createdAt ? new Date(s.createdAt as Date).toISOString() : null,
        sellerName: (s.sellerName as string) ?? null,
        sellerId: (s.sellerId as string) ?? null,
      })),
    ];

    log.info({ count: rows.length }, "admin_listings_ok");
    return NextResponse.json(rows);
  });
}
