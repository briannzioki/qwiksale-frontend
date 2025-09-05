// src/app/api/billing/upgrade/status/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

export async function GET(req: Request) {
  try {
    // --- auth ---
    const session = await auth();
    const email = (session as any)?.user?.email as string | undefined;
    if (!email) return noStore({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) return noStore({ error: "Unauthorized" }, { status: 401 });

    // --- parse query ---
    const url = new URL(req.url);
    const paymentId = url.searchParams.get("id") || url.searchParams.get("paymentId");
    if (!paymentId) {
      return noStore({ error: "Missing paymentId" }, { status: 400 });
    }

    // --- look up payment ---
    const Payment = (prisma as any).payment;
    if (!Payment?.findUnique) {
      return noStore({ error: "Payments not supported" }, { status: 501 });
    }

    const payment = await Payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        userId: true,
        amount: true,
        status: true,
        targetTier: true,
        mode: true,
        payerPhone: true,
        merchantRequestId: true,
        checkoutRequestId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!payment || payment.userId !== user.id) {
      return noStore({ error: "Not found" }, { status: 404 });
    }

    return noStore({ ok: true, payment });
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error("[billing/upgrade/status] error:", e);
    return noStore({ error: e?.message || "Server error" }, { status: 500 });
  }
}
