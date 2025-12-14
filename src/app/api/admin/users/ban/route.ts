// src/app/api/admin/users/ban/route.ts
import { prisma } from "@/app/lib/prisma";
import { getViewer } from "@/app/lib/auth";
import { err, noStore } from "@/app/api/_lib/http";

// Cast once so TS doesn’t care if Prisma types are stale
const db = prisma as any;

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return err(403, "forbidden");

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return err(400, "invalid json");
  }

  const userId = String(body.userId ?? "").trim();
  if (!userId) return err(400, "missing userId");

  const user = await db.user.update({
    where: { id: userId },
    data: {
      banned: true,
    },
  });

  return noStore({ ok: true, user });
}
