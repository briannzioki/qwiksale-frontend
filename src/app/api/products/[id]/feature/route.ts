// src/app/api/products/[id]/feature/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import type { NextRequest } from "next/server";
import {
  PATCH as adminPATCH,
  GET as adminGET,
  OPTIONS as adminOPTIONS,
} from "@/app/api/admin/products/[id]/feature/route";

/**
 * Backwards-compatible alias:
 * /api/products/[id]/feature → /api/admin/products/[id]/feature
 *
 * All logic & auth live in the admin route.
 */

// Match the admin route's expected context shape.
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return adminPATCH(req, ctx);
}

export async function GET() {
  return adminGET();
}

export async function OPTIONS() {
  return adminOPTIONS();
}
