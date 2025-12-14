// src/app/api/dashboard/summary/route.ts

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getSellerDashboardMetrics,
  getSellerInboxSummary,
  getSellerRecentListings,
  type SellerDashboardSummary,
} from "@/app/lib/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS: Record<string, string> = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0, must-revalidate",
};

export async function GET(_req: Request) {
  try {
    const session = await auth().catch(() => null);
    const uid = (session?.user as any)?.id as string | undefined;

    if (!uid) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }

    const [metrics, inbox, recentListings] = await Promise.all([
      getSellerDashboardMetrics(uid),
      getSellerInboxSummary(uid),
      getSellerRecentListings(uid, { limit: 6 }),
    ]);

    const payload: SellerDashboardSummary = {
      metrics,
      inbox,
      recentListings,
    };

    return NextResponse.json(payload, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api.dashboard.summary] GET error", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...NO_STORE_HEADERS,
      Allow: "GET,OPTIONS",
    },
  });
}
