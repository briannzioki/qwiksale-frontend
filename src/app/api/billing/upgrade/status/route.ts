// src/app/api/billing/upgrade/status/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

const isDev = process.env["NODE_ENV"] !== "production";

type SelectedPay = {
  id: string;
  status: "PENDING" | "PAID" | "FAILED";
  resultDesc: string | null;
  createdAt: Date;
  userId: string | null;
  accountRef: string | null; // we sometimes stash the tier here
};

function normalizeTier(raw: unknown): "GOLD" | "PLATINUM" | null {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase();
  return s === "GOLD" || s === "PLATINUM" ? (s as any) : null;
}

export async function GET(req: NextRequest) {
  try {
    const paymentId = req.nextUrl.searchParams.get("paymentId") || "";
    if (!paymentId) return noStore({ error: "Missing paymentId" }, { status: 400 });

    // Initial fetch
    let pay: SelectedPay | null = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        status: true,
        resultDesc: true,
        createdAt: true,
        userId: true,
        accountRef: true,
      },
    });

    if (!pay) {
      return noStore({ error: "Not found" }, { status: 404 });
    }

    // ---------- Dev auto-confirm (optional) ----------
    if (isDev && pay.status === "PENDING") {
      const ageMs = Date.now() - new Date(pay.createdAt).getTime();
      if (ageMs > 20_000) {
        await prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: paymentId },
            data: { status: "PAID", resultDesc: "Auto-confirmed (dev)" },
          });

          const tier = normalizeTier(pay!.accountRef);
          if (pay!.userId && tier) {
            const until = new Date();
            until.setDate(until.getDate() + 30);
            await tx.user.update({
              where: { id: pay!.userId },
              data: { subscription: tier as any, subscriptionUntil: until },
            });
          }
        });

        // Re-fetch to reflect the updated status/resultDesc
        const refreshed = await prisma.payment.findUnique({
          where: { id: paymentId },
          select: {
            id: true,
            status: true,
            resultDesc: true,
            createdAt: true,
            userId: true,
            accountRef: true,
          },
        });
        if (refreshed) pay = refreshed;
      }
    }

    // If a refresh path resulted in null (very unlikely), guard again.
    if (!pay) {
      return noStore({ error: "Not found" }, { status: 404 });
    }

    // ---------- Map DB → hook-friendly statuses ----------
    let status: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";
    if (pay.status === "PAID") {
      status = "SUCCESS";
    } else if (pay.status === "FAILED") {
      status = "FAILED";
    } else {
      const age = Date.now() - new Date(pay.createdAt).getTime();
      status = age > 8_000 ? "PROCESSING" : "PENDING";
    }

    return noStore({ status, message: pay.resultDesc || null });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[billing/upgrade/status GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
