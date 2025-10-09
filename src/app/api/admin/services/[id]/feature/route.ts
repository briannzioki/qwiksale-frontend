// src/app/api/admin/services/[id]/feature/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import {
  PATCH as basePATCH,
  OPTIONS as baseOPTIONS,
  GET as baseGET,
} from "@/app/api/services/[id]/feature/route";

// Thin wrapper so /api/admin/services/[id]/feature mirrors /api/services/[id]/feature
export async function PATCH(req: NextRequest, ctx: any) {
  return basePATCH(req, ctx);
}

export async function OPTIONS() {
  return baseOPTIONS();
}

// ❗ forward both req and context to base GET
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return baseGET(req, ctx);
}
