// src/app/api/referrals/stats/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

// Build a human-ish code from username + random suffix
function makeCodeFrom(username?: string | null): string {
  const base = (username || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base || "qs"}-${rand}`;
}

// Try generating a unique referralCode; retry on unique constraint conflict
async function ensureReferralCode(userId: string, username?: string | null) {
  // If already set, return it fast
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (current?.referralCode) return current.referralCode;

  let lastErr: unknown = null;
  for (let i = 0; i < 5; i++) {
    const code = makeCodeFrom(username);
    try {
      const r = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
        select: { referralCode: true },
      });
      return r.referralCode;
    } catch (e: any) {
      // P2002 => unique conflict; try again with a new random part
      if (e?.code === "P2002") {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error("Failed to assign referral code");
}

function baseUrlFrom(req: NextRequest): string {
  // Prefer explicit env if set (e.g., https://app.qwiksale.sale)
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.SITE_URL ||
    "";
  if (envUrl) return envUrl.replace(/\/+$/, "");

  // Fallback to request origin
  const proto =
    req.headers.get("x-forwarded-proto") ||
    (process.env.NODE_ENV === "production" ? "https" : "http");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

/** GET /api/referrals/stats */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const uid = (session as any)?.user?.id as string | undefined;
    if (!uid) return noStore({ error: "Unauthorized" }, { status: 401 });

    // Fetch minimal user info
    const me = await prisma.user.findUnique({
      where: { id: uid },
      select: {
        id: true,
        username: true,
        referralCode: true,
        referralQualified: true,
      },
    });
    if (!me) return noStore({ error: "Not found" }, { status: 404 });

    // Ensure code exists and is unique
    const referralCode =
      me.referralCode || (await ensureReferralCode(me.id, me.username));

    // Counts
    const [totalInvites, totalQualified] = await Promise.all([
      prisma.referral.count({ where: { inviterId: uid } }),
      prisma.referral.count({ where: { inviterId: uid, qualifiedAt: { not: null } } }),
    ]);

    // Helpful share URLs
    const base = baseUrlFrom(req);
    const shareUrl = `${base}/signup?ref=${encodeURIComponent(referralCode)}`;
    const copyText = `Join me on QwikSale! Sign up with my invite: ${shareUrl}`;

    return noStore({
      ok: true,
      code: referralCode,
      shareUrl,
      copyText, // convenient for a "Copy" button
      counts: { invited: totalInvites, qualified: totalQualified },
      qualifiedOnUser: me.referralQualified ?? 0, // mirror (optional)
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/referrals/stats GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
