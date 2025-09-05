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
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

const THRESHOLD = 10;   // award every 10 qualified referrals
const AWARD_DAYS = 30;  // extend GOLD by 30 days per milestone

// Minimal shape of the transaction client we use (no need to import Prisma types)
type TxLike = {
  user: typeof prisma.user;
  referral: typeof prisma.referral;
};

export async function POST(req: Request) {
  try {
    const session = await auth();
    const meId = (session as any)?.user?.id as string | undefined;
    if (!meId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({} as any));
    const codeRaw = String(body?.code || "").trim();
    if (!codeRaw) return noStore({ error: "Missing code" }, { status: 400 });

    // Basic format check (3–32 word-ish chars); adjust if your codes differ
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(codeRaw)) {
      return noStore({ error: "Invalid code" }, { status: 400 });
    }

    const me = await prisma.user.findUnique({
      where: { id: meId },
      select: { id: true, referredById: true },
    });
    if (!me) return noStore({ error: "Not found" }, { status: 404 });

    // Find inviter from code (case-insensitive)
    const inviter = await prisma.user.findFirst({
      where: { referralCode: { equals: codeRaw, mode: "insensitive" } },
      select: { id: true, subscription: true, subscriptionUntil: true },
    });
    if (!inviter) return noStore({ error: "Invalid code" }, { status: 400 });
    if (inviter.id === me.id) {
      return noStore({ error: "You cannot refer yourself" }, { status: 400 });
    }

    // Already linked? Bail early (idempotent)
    if (me.referredById) {
      return noStore({ error: "Already linked to a referrer" }, { status: 400 });
    }

    // Also guard if a referral row already exists for this invitee (idempotent)
    const existingReferral = await prisma.referral.findFirst({
      where: { inviteeId: me.id },
      select: { id: true, inviterId: true },
    });
    if (existingReferral) {
      return noStore(
        {
          error: "Referral already claimed",
          inviterId: existingReferral.inviterId,
        },
        { status: 409 }
      );
    }

    const now = new Date();

    // Transaction: link invitee -> inviter, create referral, recompute qualified count,
    // bump inviter's cached counter, and award on milestones
    await prisma.$transaction(async (tx: TxLike) => {
      // Link invitee to inviter
      await tx.user.update({
        where: { id: me.id },
        data: { referredById: inviter.id },
      });

      // Create qualified referral
      await tx.referral.create({
        data: {
          code: codeRaw,
          inviterId: inviter.id,
          inviteeId: me.id,
          createdAt: now,
          qualifiedAt: now, // qualify immediately (your current logic)
        },
      });

      // Count qualified referrals for inviter
      const qualified = await tx.referral.count({
        where: { inviterId: inviter.id, qualifiedAt: { not: null } },
      });

      // Mirror cached counter on inviter
      await tx.user.update({
        where: { id: inviter.id },
        data: { referralQualified: qualified },
      });

      // Award GOLD extension each time a milestone is hit (10, 20, 30, …)
      if (qualified > 0 && qualified % THRESHOLD === 0) {
        await tx.user.update({
          where: { id: inviter.id },
          data: {
            subscription: "GOLD",
            subscriptionUntil: extendByDays(inviter.subscriptionUntil, AWARD_DAYS),
          },
        });
      }
    });

    // Return inviter’s updated stats
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
  } catch (e: any) {
    // Unique constraint guard (if schema enforces unique inviteeId)
    if (e?.code === "P2002") {
      return noStore({ error: "Referral already claimed" }, { status: 409 });
    }
    // eslint-disable-next-line no-console
    console.warn("[/api/referrals/claim POST] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
