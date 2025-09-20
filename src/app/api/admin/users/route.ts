export const preferredRegion = 'fra1';
// src/app/api/admin/users/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { assertAdmin } from "../_lib/guard";
import { withApiLogging } from "@/app/lib/api-logging";

type Out = {
  id: string;
  email: string | null;
  name: string | null;
  username: string | null;
  role: string | null;
  createdAt: string | null;
}[];

/* --------------------------- tiny response helpers --------------------------- */
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

/* ----------------------------------- GET ----------------------------------- */
export async function GET(req: NextRequest) {
  const denied = await assertAdmin();
  if (denied) return denied;

  return withApiLogging(req, "/api/admin/users", async (log) => {
    try {
      const url = new URL(req.url);

      // Optional search/pagination
      const q = (url.searchParams.get("q") || "").trim();
      const limit = toInt(url.searchParams.get("limit"), 100, 1, 500);
      const page = toInt(url.searchParams.get("page"), 1, 1, 1000);
      const skip = (page - 1) * limit;

      const where: any = {};
      if (q) {
        where.OR = [
          { email: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          // If your schema lacks `username`, Prisma will ignore this at runtime due to the `as any` select below
          { username: { contains: q, mode: "insensitive" } },
        ];
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          take: limit,
          skip,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            email: true,
            name: true,
            // Keep schema-tolerant for installations without these fields:
            username: true as any,
            role: true as any,
            createdAt: true,
          },
        }),
        prisma.user.count({ where }).catch(() => 0),
      ]);

      const out: Out = (users as any[]).map((u) => ({
        id: String(u.id),
        email: u.email ?? null,
        name: u.name ?? null,
        username: u.username ?? null,
        role: u.role ?? null,
        createdAt:
          u.createdAt instanceof Date
            ? u.createdAt.toISOString()
            : u.createdAt
            ? String(u.createdAt)
            : null,
      }));

      log.info({ count: out.length, page, limit, total }, "admin_users_ok");

      const res = noStoreJson(out);
      res.headers.set("X-Total-Count", String(total));
      res.headers.set("X-Page", String(page));
      res.headers.set("X-Per-Page", String(limit));
      return res;
    } catch (err) {
      log.error({ err }, "admin_users_error");
      return noStoreJson({ error: "Server error" }, { status: 500 });
    }
  });
}
