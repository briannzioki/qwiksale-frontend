export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getViewer } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { err, noStore } from "@/app/api/_lib/http";

const db = prisma as any;

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
    body = await req.json();
  } catch {
    return err(400, "invalid json");
  }

  // Accept both shapes:
  // - { listingId, kind, suspended } (from ListingActions.client)
  // - { id, type } (legacy)
  const id = String(body.listingId ?? body.id ?? "").trim();
  const kind = String(body.kind ?? body.type ?? "product").trim().toLowerCase();
  const suspendedRaw = parseBool(body.suspended ?? body.suspend ?? body.value);

  if (!id) return err(400, "missing id");
  if (kind !== "product" && kind !== "service") return err(400, "invalid type");

  const nextSuspended = suspendedRaw ?? true;

  const anyPrisma = prisma as any;
  const serviceModel =
    anyPrisma.service ??
    anyPrisma.services ??
    anyPrisma.Service ??
    anyPrisma.Services ??
    null;

  const setHidden = async (model: any) => {
    // Try setting both status + suspended flag; fall back to status only.
    try {
      await model.update({
        where: { id },
        data: { status: "HIDDEN", suspended: true },
      });
    } catch {
      await model.update({
        where: { id },
        data: { status: "HIDDEN" },
      });
    }
  };

  const setActive = async (model: any) => {
    // Only unhide if it’s currently hidden; avoids clobbering SOLD/DRAFT unintentionally.
    try {
      await model.updateMany({
        where: { id, status: "HIDDEN" },
        data: { status: "ACTIVE" },
      });
    } catch {
      // If status enum differs, still attempt a direct update below.
    }

    try {
      await model.update({
        where: { id },
        data: { suspended: false },
      });
    } catch {
      // ignore: schema may not have suspended boolean
    }
  };

  try {
    if (kind === "product") {
      if (nextSuspended) await setHidden(db.product);
      else await setActive(db.product);
    } else {
      if (!serviceModel) return err(400, "service model not available");
      if (nextSuspended) await setHidden(serviceModel);
      else await setActive(serviceModel);
    }

    return noStore({ ok: true, id, type: kind, suspended: nextSuspended });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/admin/listings/suspend POST] error:", e);
    return err(500, "server error");
  }
}
