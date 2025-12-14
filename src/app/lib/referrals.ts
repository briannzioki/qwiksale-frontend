// src/app/lib/referrals.ts
import "server-only";

import { prisma } from "@/app/lib/prisma";
import { extendByDays } from "@/app/lib/subscription";
import { normalizeReferralCode } from "@/app/lib/referral-cookie";

export const REFERRAL_THRESHOLD = 10;
export const REFERRAL_AWARD_DAYS = 30;

export type ClaimReferralInput = { meId: string; code: string };

export type ClaimReferralResult = {
  inviter: {
    id: string;
    referralQualified: number;
    subscription: string | null;
    subscriptionUntil: string | null;
  };
  threshold: number;
  awardDays: number;
};

function err(message: string, statusCode: number, code: string) {
  return Object.assign(new Error(message), { statusCode, code });
}

export async function claimReferral({
  meId,
  code,
}: ClaimReferralInput): Promise<ClaimReferralResult> {
  const meIdSafe = String(meId || "").trim();
  if (!meIdSafe) throw err("Unauthorized", 401, "UNAUTHORIZED");

  const normalized = normalizeReferralCode(code);
  if (!normalized) throw err("Invalid code", 400, "INVALID_CODE");

  const inviter = await prisma.user.findFirst({
    where: { referralCode: { equals: normalized, mode: "insensitive" } },
    select: {
      id: true,
      subscription: true,
      subscriptionUntil: true,
      referralQualified: true,
    },
  });

  if (!inviter) throw err("Invalid code", 400, "INVALID_CODE");
  if (inviter.id === meIdSafe)
    throw err("You cannot refer yourself", 400, "SELF_REFERRAL");

  const now = new Date();

  await prisma.$transaction(async (tx: any) => {
    const me = await tx.user.findUnique({
      where: { id: meIdSafe },
      select: { id: true, referredById: true },
    });
    if (!me) throw err("Not found", 404, "NOT_FOUND");

    if (me.referredById) {
      throw err("Already linked to a referrer", 400, "ALREADY_LINKED");
    }

    const existing = await tx.referral.findFirst({
      where: { inviteeId: me.id },
      select: { id: true },
    });
    if (existing) {
      throw err("Referral already claimed", 409, "ALREADY_CLAIMED");
    }

    await tx.user.update({
      where: { id: me.id },
      data: { referredById: inviter.id },
    });

    await tx.referral.create({
      data: {
        code: normalized,
        inviterId: inviter.id,
        inviteeId: me.id,
        createdAt: now,
        qualifiedAt: now,
      },
    });

    const qualified = await tx.referral.count({
      where: { inviterId: inviter.id, qualifiedAt: { not: null } },
    });

    await tx.user.update({
      where: { id: inviter.id },
      data: { referralQualified: qualified },
    });

    if (qualified > 0 && qualified % REFERRAL_THRESHOLD === 0) {
      const invNow = await tx.user.findUnique({
        where: { id: inviter.id },
        select: { subscriptionUntil: true },
      });

      await tx.user.update({
        where: { id: inviter.id },
        data: {
          subscription: "GOLD",
          subscriptionUntil: extendByDays(
            (invNow?.subscriptionUntil ?? inviter.subscriptionUntil) as any,
            REFERRAL_AWARD_DAYS,
          ),
        },
      });
    }
  });

  const after = await prisma.user.findUnique({
    where: { id: inviter.id },
    select: {
      id: true,
      referralQualified: true,
      subscription: true,
      subscriptionUntil: true,
    },
  });

  if (!after) throw err("Not found", 404, "NOT_FOUND");

  return {
    inviter: {
      id: after.id,
      referralQualified: Number(after.referralQualified ?? 0),
      subscription: (after.subscription as any) ?? null,
      subscriptionUntil: after.subscriptionUntil
        ? after.subscriptionUntil.toISOString()
        : null,
    },
    threshold: REFERRAL_THRESHOLD,
    awardDays: REFERRAL_AWARD_DAYS,
  };
}
