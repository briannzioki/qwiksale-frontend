export const preferredRegion = ['fra1'];
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { extendByDays } from "@/app/lib/subscription";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

/**
 * Milestones & rewards
 * - THRESHOLD: award every N qualified referrals
 * - AWARD_DAYS: extend GOLD by this many days per milestone
 */
const THRESHOLD = 10;
const AWARD_DAYS = 30;

type Body = { code?: string };

/**
 * POST /api/referrals/claim
 * Body: { code: string }
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    const meId = (session as any)?.user?.id as string | undefined;
    if (!meId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Body;
    const codeRaw = String(body?.code ?? "").trim();
    if (!codeRaw) return noStore({ error: "Missing code" }, { status: 400 });

    // Basic format check (adjust to your code patterns)
    if (!/^[A-Za-z0-9._-]{3,64}$/.test(codeRaw)) {
      return noStore({ error: "Invalid code" }, { status: 400 });
    }

    // Find inviter by code (case-insensitive)
    const inviter = await prisma.user.findFirst({
      where: { referralCode: { equals: codeRaw, mode: "insensitive" } },
      select: {
        id: true,
        subscription: true,
        subscriptionUntil: true,
      },
    });
    if (!inviter) return noStore({ error: "Invalid code" }, { status: 400 });
    if (inviter.id === meId) {
      return noStore({ error: "You cannot refer yourself" }, { status: 400 });
    }

    const now = new Date();

    // All mutations inside a transaction to avoid race conditions
    await prisma.$transaction(async (tx: any) => {
      // Re-read current user inside the txn to avoid race with other claims
      const me = await tx.user.findUnique({
        where: { id: meId },
        select: { id: true, referredById: true },
      });
      if (!me) throw new Error("Not found");

      // Already linked? (idempotent)
      if (me.referredById) {
        throw Object.assign(new Error("Already linked to a referrer"), {
          statusCode: 400,
          code: "ALREADY_LINKED",
        });
      }

      // Already has a referral row? (idempotent)
      const existingReferral = await tx.referral.findFirst({
        where: { inviteeId: me.id },
        select: { id: true, inviterId: true },
      });
      if (existingReferral) {
        throw Object.assign(new Error("Referral already claimed"), {
          statusCode: 409,
          code: "ALREADY_CLAIMED",
        });
      }

      // Link invitee -> inviter
      await tx.user.update({
        where: { id: me.id },
        data: { referredById: inviter.id },
      });

      // Create *qualified* referral row now (adapt if you have a separate flow)
      await tx.referral.create({
        data: {
          code: codeRaw,
          inviterId: inviter.id,
          inviteeId: me.id,
          createdAt: now,
          qualifiedAt: now,
        },
      });

      // Recompute qualified referrals for inviter
      const qualified = await tx.referral.count({
        where: { inviterId: inviter.id, qualifiedAt: { not: null } },
      });

      // Mirror cached counter on inviter
      await tx.user.update({
        where: { id: inviter.id },
        data: { referralQualified: qualified },
      });

      // Award milestone GOLD extension (10, 20, 30, …)
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
    // Prisma unique constraint (e.g., unique inviteeId on Referral)
    if (e?.code === "P2002") {
      return noStore({ error: "Referral already claimed" }, { status: 409 });
    }
    // Custom idempotent guards bubbled from txn
    if (e?.code === "ALREADY_LINKED") {
      return noStore({ error: "Already linked to a referrer" }, { status: 400 });
    }
    if (e?.code === "ALREADY_CLAIMED") {
      return noStore({ error: "Referral already claimed" }, { status: 409 });
    }

    // eslint-disable-next-line no-console
    console.warn("[/api/referrals/claim POST] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
