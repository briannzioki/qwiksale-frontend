import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getSellerDashboardMetrics,
  getSellerInboxSummary,
  getSellerRecentListings,
  type SellerDashboardSummary,
} from "@/app/lib/dashboard";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS: Record<string, string> = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0, must-revalidate",
};

type CarrierSummaryBlock = {
  hasProfile: boolean;
  status: string | null;
  planTier: string | null;
  isSuspended: boolean;
  isBanned: boolean;
};

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const s = String(value);
  const ts = Date.parse(s);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts);
}

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

    const [metrics, inbox, recentListings, carrier] = await Promise.all([
      getSellerDashboardMetrics(uid),
      getSellerInboxSummary(uid),
      getSellerRecentListings(uid, { limit: 6 }),
      (async (): Promise<CarrierSummaryBlock> => {
        try {
          const profile = await (prisma as any).carrierProfile.findUnique({
            where: { userId: uid },
            select: {
              status: true,
              planTier: true,
              bannedAt: true,
              suspendedUntil: true,
            },
          });

          if (!profile) {
            return {
              hasProfile: false,
              status: null,
              planTier: null,
              isSuspended: false,
              isBanned: false,
            };
          }

          const now = new Date();
          const bannedAt = toDateOrNull(profile?.bannedAt);
          const suspendedUntil = toDateOrNull(profile?.suspendedUntil);

          return {
            hasProfile: true,
            status: typeof profile?.status === "string" ? profile.status : null,
            planTier:
              typeof profile?.planTier === "string" ? profile.planTier : null,
            isSuspended:
              suspendedUntil != null && suspendedUntil.getTime() > now.getTime(),
            isBanned: bannedAt != null,
          };
        } catch {
          // If schema isn't migrated yet or model is unavailable, treat as no-profile.
          return {
            hasProfile: false,
            status: null,
            planTier: null,
            isSuspended: false,
            isBanned: false,
          };
        }
      })(),
    ]);

    const payload: SellerDashboardSummary & { carrier: CarrierSummaryBlock } = {
      metrics,
      inbox,
      recentListings,
      carrier,
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
