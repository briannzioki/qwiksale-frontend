export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import type { NextRequest } from "next/server";
import { assertAdmin } from "@/app/api/admin/_lib/guard";
import {
  PATCH as basePATCH,
  OPTIONS as baseOPTIONS,
  GET as baseGET,
} from "@/app/api/services/[id]/feature/route";

// Admin-only wrapper around the base feature toggle routes

export async function PATCH(req: NextRequest, ctx: any) {
  const denied = await assertAdmin();
  if (denied) return denied;
  return basePATCH(req, ctx);
}

export async function OPTIONS() {
  const denied = await assertAdmin();
  if (denied) return denied;
  return baseOPTIONS();
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await assertAdmin();
  if (denied) return denied;
  return baseGET(req, ctx);
}
