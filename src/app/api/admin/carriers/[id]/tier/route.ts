export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { assertAdmin } from "../../../_lib/guard";
import { withApiLogging, type RequestLog } from "@/app/lib/api-logging";

/** tiny helper to ensure proper caching/vary on all JSON */
function jsonNoStore(payload: unknown, init?: ResponseInit) {
  const res = NextResponse.json(payload, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
  return res;
}

function badRequest(message: string) {
  return jsonNoStore({ error: message }, { status: 400 });
}

function notFound(message = "Not found") {
  return jsonNoStore({ error: message }, { status: 404 });
}

async function readJson(req: NextRequest) {
  try {
    const ct = req.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("application/json")) return null;
    return await req.json();
  } catch {
    return null;
  }
}

function normalizeTier(v: any) {
  const s = String(v || "").trim().toUpperCase();
  if (s === "BASIC" || s === "GOLD" || s === "PLATINUM") return s;
  return null;
}

type Body = { planTier?: string };
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const denied = await assertAdmin();
  if (denied) return denied;

  return withApiLogging(req, "/api/admin/carriers/[id]/tier", async (log: RequestLog) => {
    const params = await ctx.params;
    const id = String((params as any)?.id ?? "").trim();
    if (!id) return notFound("Missing id");

    const anyPrisma = prisma as any;
    const carrierModel = anyPrisma?.carrierProfile;

    if (!carrierModel || typeof carrierModel.update !== "function") {
      return jsonNoStore(
        { error: "Carrier model is not available yet. Run the Prisma migration for CarrierProfile first." },
        { status: 501 },
      );
    }

    const body = (await readJson(req)) as Body | null;
    if (!body) return badRequest("Expected JSON body");

    const planTier = normalizeTier(body.planTier);
    if (!planTier) return badRequest("Invalid planTier. Expected BASIC, GOLD, or PLATINUM.");

    try {
      const updated = await carrierModel.update({
        where: { id },
        data: { planTier },
        select: { id: true, planTier: true, updatedAt: true },
      });

      log.info({ carrierId: id, planTier }, "admin_carrier_tier_ok");

      return jsonNoStore({
        ok: true,
        carrierId: String(updated?.id ?? id),
        planTier: String(updated?.planTier ?? planTier),
      });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      log.error({ err: msg }, "admin_carrier_tier_failed");
      return jsonNoStore({ error: "Failed to update plan tier." }, { status: 500 });
    }
  });
}
