// src/app/api/admin/users/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { assertAdmin } from "../_lib/guard";
import { withApiLogging } from "@/app/lib/api-logging";

export const dynamic = "force-dynamic";

type Out = {
  id: string;
  email: string | null;
  name: string | null;
  username: string | null;
  role: string | null;
  createdAt: string | null;
}[];

export async function GET(req: NextRequest) {
  const denied = await assertAdmin();
  if (denied) return denied;

  return withApiLogging(req, "/api/admin/users", async (log) => {
    const url = new URL(req.url);
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));

    const users = await prisma.user.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        username: true as any, // adjust if your schema differs
        role: true as any,
        createdAt: true,
      },
    });

    const out: Out = users.map((u: any) => ({
      id: u.id,
      email: u.email ?? null,
      name: u.name ?? null,
      username: u.username ?? null,
      role: u.role ?? null,
      createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null,
    }));

    log.info({ count: out.length }, "admin_users_ok");
    return NextResponse.json(out);
  });
}
