// Debug endpoint — safe to keep temporarily in prod
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

// Optional: protect with a token so it's not public
const DEBUG_TOKEN = process.env["DEBUG_TOKEN"] ?? "";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function redact(url?: string | null) {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.password) u.password = "*****";
    if (u.username) u.username = u.username.slice(0, 2) + "****";
    return `${u.protocol}//${u.username ? u.username + ":" : ""}${u.password ? u.password + "@" : ""}${u.host}${u.pathname}${u.search}`;
  } catch {
    return "unparseable";
  }
}

export async function GET(req: Request) {
  try {
    // Guard (optional): require ?token=... if DEBUG_TOKEN is set
    if (DEBUG_TOKEN) {
      const url = new URL(req.url);
      const token = url.searchParams.get("token") || "";
      if (token !== DEBUG_TOKEN) {
        return noStore({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const DEMO_EMAIL =
      process.env["SEED_DEMO_USER_EMAIL"] ||
      process.env["DEMO_SELLER_EMAIL"] ||
      "";

    // Basic DB facts
    const [dbRow]: Array<{ current_database: string }> =
      (await prisma.$queryRawUnsafe(`SELECT current_database();`)) as any;
    const [verRow]: Array<{ version: string }> =
      (await prisma.$queryRawUnsafe(`SELECT version();`)) as any;

    // Counts
    const totalProducts = await prisma.product.count();
    const activeProducts = await prisma.product.count({ where: { status: "ACTIVE" } });

    // Demo filtering check (mirrors products route)
    const whereNoDemo: any = { status: "ACTIVE" };
    if (DEMO_EMAIL) {
      whereNoDemo.AND = [
        { NOT: { seller: { is: { email: { equals: DEMO_EMAIL, mode: "insensitive" } } } } },
        { NOT: { name: { contains: "• Batch" } } },
      ];
    } else {
      whereNoDemo.AND = [{ NOT: { name: { contains: "• Batch" } } }];
    }

    const activeNoDemo = await prisma.product.count({ where: whereNoDemo });

    // Sample items (to confirm ordering/shape)
    const sample = await prisma.product.findMany({
      where: whereNoDemo,
      select: {
        id: true,
        name: true,
        price: true,
        featured: true,
        createdAt: true,
        sellerId: true,
        seller: { select: { id: true, username: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return noStore({
      ok: true,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL: redact(process.env["DATABASE_URL"]),
        DIRECT_URL: redact(process.env["DIRECT_URL"]),
        DEMO_EMAIL,
      },
      db: {
        currentDatabase: dbRow?.current_database ?? "",
        version: verRow?.version ?? "",
      },
      counts: {
        totalProducts,           // all rows in Product
        activeProducts,          // status = ACTIVE
        activeExcludingDemo: activeNoDemo, // ACTIVE minus demo/seeded clones
      },
      sample, // first 5 after filters
    });
  } catch (e: any) {
    return noStore({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
