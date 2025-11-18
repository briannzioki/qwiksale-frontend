export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { assertAdmin } from "../_lib/guard";
import { withApiLogging, type RequestLog } from "@/app/lib/api-logging";

type AdminUser = {
  id: string;
  email: string | null;
  name: string | null;
  username: string | null;
  role: string | null;
  createdAt: string | null;
};

function noStoreJson(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
  return res;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toInt(raw: string | null, def: number, min: number, max: number) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return clamp(Math.trunc(n), min, max);
}

const ALLOWED_ROLES = new Set(["USER", "MODERATOR", "ADMIN", "SUPERADMIN"]);

export async function GET(req: NextRequest) {
  const denied = await assertAdmin();
  if (denied) return denied;

  return withApiLogging(req, "/api/admin/users", async (log: RequestLog) => {
    try {
      const url = new URL(req.url);
      const q = (url.searchParams.get("q") || "").trim();
      const roleRaw = (url.searchParams.get("role") || "").trim().toUpperCase();
      const limit = toInt(url.searchParams.get("limit"), 200, 1, 500);
      const page = toInt(url.searchParams.get("page"), 1, 1, 5000);
      const skip = (page - 1) * limit;

      const where: any = {};
      if (q) {
        const like = { contains: q, mode: "insensitive" } as const;
        where.OR = [{ email: like }, { name: like }, { username: like }];
        // exact id match (optional — won’t 500 on non-uuid)
        if (q.length >= 8) where.OR.push({ id: q });
      }
      if (ALLOWED_ROLES.has(roleRaw)) {
        where.role = roleRaw;
      }

      const [total, rows] = await Promise.all([
        prisma.user.count({ where }).catch(() => 0),
        prisma.user.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip,
          take: limit,
          select: {
            id: true,
            email: true,
            name: true,
            username: true,
            role: true,
            createdAt: true,
          },
        }),
      ]);

      const out: AdminUser[] = rows.map((u) => ({
        id: String(u.id),
        email: u.email ?? null,
        name: u.name ?? null,
        username: u.username ?? null,
        role: u.role ?? null,
        createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : (u.createdAt as any) ?? null,
      }));

      log.info({ returned: out.length, total, page, limit, q: q || null, role: where.role ?? null }, "admin_users_ok");

      const res = noStoreJson(out);
      res.headers.set("X-Total-Count", String(total));
      res.headers.set("X-Page", String(page));
      res.headers.set("X-Per-Page", String(limit));
      return res;
    } catch (err) {
      console.error("[/api/admin/users GET] error:", err);
      return noStoreJson({ error: "Server error" }, { status: 500 });
    }
  });
}
