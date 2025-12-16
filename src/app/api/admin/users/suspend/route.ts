export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getViewer } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { err, noStore } from "@/app/api/_lib/http";

// Cast once so this keeps compiling even if Prisma client types lag behind schema
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

  const action = String(body.action ?? "").trim().toLowerCase(); // "suspend" | "unsuspend"
  const explicit = parseBool(body.suspended ?? body.value ?? body.enabled);
  const suspended = explicit ?? (action === "unsuspend" ? false : true);

  try {
    const user = await db.user.update({
      where: { id: userId },
      data: { suspended },
    });

    return noStore({ ok: true, user });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/admin/users/suspend POST] error:", e);
    return err(500, "server error");
  }
}
