export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { prisma } from "@/app/lib/prisma";
import { getViewer } from "@/app/lib/auth";
import { err, noStore } from "@/app/api/_lib/http";

// Cast once so TS doesn’t care if Prisma types are stale
const db = prisma as any;

async function readBody(req: Request): Promise<any> {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    return (await req.json().catch(() => ({}))) as any;
  }
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return {};
    const out: Record<string, any> = {};
    for (const [k, v] of fd.entries()) out[k] = v;
    return out;
  }
  return {};
}

function parseBool(v: any): boolean | undefined {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return undefined;
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  return undefined;
}

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return err(403, "forbidden");

  let body: any = {};
  try {
    body = await readBody(req);
  } catch {
    return err(400, "invalid body");
  }

  const userId = String(body.userId ?? body.id ?? "").trim();
  if (!userId) return err(400, "missing userId");

  const action = String(body.action ?? "").trim().toLowerCase(); // "ban" | "unban"
  const explicit = parseBool(body.banned ?? body.value ?? body.enabled);
  const banned = explicit ?? (action === "unban" ? false : true);

  try {
    const user = await db.user.update({
      where: { id: userId },
      data: { banned },
    });

    return noStore({ ok: true, user });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/admin/users/ban POST] error:", e);
    return err(500, "server error");
  }
}
