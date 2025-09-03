// src/app/api/referrals/claim/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { extendByDays } from "@/app/lib/subscription";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

const THRESHOLD = 10; // award after 10 qualified referrals
const AWARD_DAYS = 30;

// Minimal shape of the transaction client we use (no need to import Prisma types)
type TxLike = {
  user: typeof prisma.user;
  referral: typeof prisma.referral;
};

export async function POST(req: Request) {
  const session = await auth();
  const meId = (session as any)?.user?.id as string | undefined;
  if (!meId) return noStore({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const code = String(body?.code || "").trim();
  if (!code) return noStore({ error: "Missing code" }, { status: 400 });

  const me = await prisma.user.findUnique({
    where: { id: meId },
    select: { id: true, referredById: true, createdAt: true },
  });
  if (!me) return noStore({ error: "Not found" }, { status: 404 });

  // Find inviter from code
  const inviter = await prisma.user.findFirst({
    where: { referralCode: code },
    select: { id: true, subscription: true, subscriptionUntil: true },
  });
  if (!inviter) return noStore({ error: "Invalid code" }, { status: 400 });
  if (inviter.id === me.id) return noStore({ error: "You cannot refer yourself" }, { status: 400 });
  if (me.referredById) return noStore({ error: "Already linked to a referrer" }, { status: 400 });

  // Create Referral row + link user (qualify immediately for now)
  const now = new Date();

  await prisma.$transaction(async (tx: TxLike) => {
    await tx.user.update({
      where: { id: me.id },
      data: { referredById: inviter.id },
    });

    await tx.referral.create({
      data: {
        code,
        inviterId: inviter.id,
        inviteeId: me.id,
        createdAt: now,
        qualifiedAt: now,
      },
    });

    // Update cached counter on inviter (optional mirror)
    const qualified = await tx.referral.count({
      where: { inviterId: inviter.id, qualifiedAt: { not: null } },
    });

    await tx.user.update({
      where: { id: inviter.id },
      data: { referralQualified: qualified },
    });

    if (qualified >= THRESHOLD) {
      // Award or extend GOLD by 30 days
      await tx.user.update({
        where: { id: inviter.id },
        data: {
          subscription: "GOLD",
          subscriptionUntil: extendByDays(inviter.subscriptionUntil, AWARD_DAYS),
        },
      });
    }
  });

  // Return inviter’s new stats
  const after = await prisma.user.findUnique({
    where: { id: inviter.id },
    select: {
      id: true,
      referralQualified: true,
      subscription: true,
      subscriptionUntil: true,
    },
  });

  return noStore({
    ok: true,
    inviter: after,
    threshold: THRESHOLD,
    awardDays: AWARD_DAYS,
  });
}
