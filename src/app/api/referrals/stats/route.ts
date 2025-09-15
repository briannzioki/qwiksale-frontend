export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

/**
 * GET /api/referrals/stats
 *
 * Returns the caller's referral code (creating one if missing) and some counts.
 * Optional: include=recent -> returns last 20 referrals with invitee email if available.
 */

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

/**
 * Atomically ensure a unique referral code is set.
 * Uses UPDATE … WHERE referralCode IS NULL RETURNING to avoid races.
 * Retries on unique conflicts (P2002).
 */
async function ensureReferralCodeAtomic(userId: string, username?: string | null) {
  // quick short-circuit if already set
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (current?.referralCode) return current.referralCode;

  let lastErr: unknown = null;

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCodeFrom(username);

    try {
      const rowsRaw = await prisma.$queryRaw<Array<{ referralCode: string }>>`
        UPDATE "User"
        SET "referralCode" = ${code}
        WHERE "id" = ${userId} AND "referralCode" IS NULL
        RETURNING "referralCode"
      `;

      // Defensive: $queryRaw can be any; ensure it's an array before indexing.
      const rows = Array.isArray(rowsRaw) ? rowsRaw : [];

      if (rows.length > 0 && rows[0] && typeof rows[0].referralCode === "string") {
        return rows[0].referralCode;
      }

      // Nothing returned — either no row matched or code was set concurrently.
      const after = await prisma.user.findUnique({
        where: { id: userId },
        select: { referralCode: true },
      });
      if (after?.referralCode) return after.referralCode;

      // Still null: retry with a new code
      continue;
    } catch (e: any) {
      // Unique clash on the randomly generated code; retry
      if (e && e.code === "P2002") {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }

  // Final check before giving up
  const final = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (final?.referralCode) return final.referralCode;

  throw lastErr || new Error("Failed to assign referral code");
}

function baseUrlFrom(req: NextRequest): string {
  const envUrl =
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["APP_URL"] ||
    process.env["SITE_URL"] ||
    "";
  if (envUrl) return envUrl.replace(/\/+$/, "");

  const proto =
    req.headers.get("x-forwarded-proto") ||
    (process.env.NODE_ENV === "production" ? "https" : "http");
  const host =
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    "localhost:3000";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

/** GET /api/referrals/stats */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const uid = (session as any)?.user?.id as string | undefined;
    if (!uid) return noStore({ error: "Unauthorized" }, { status: 401 });

    const includeRecent = (new URL(req.url).searchParams.get("include") || "")
      .toLowerCase()
      .includes("recent");

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

    // Ensure code exists
    const referralCode =
      me.referralCode || (await ensureReferralCodeAtomic(me.id, me.username));

    // Counts
    const [totalInvites, totalQualified] = await Promise.all([
      prisma.referral.count({ where: { inviterId: uid } }),
      prisma.referral.count({
        where: { inviterId: uid, qualifiedAt: { not: null } },
      }),
    ]);

    // Optional recent list
    let recent:
      | Array<{
          id: string;
          inviteeEmail: string | null;
          createdAt: Date;
          qualifiedAt: Date | null;
        }>
      | undefined;

    if (includeRecent) {
      type RecentRow = {
        id: string;
        createdAt: Date;
        qualifiedAt: Date | null;
        invitee: { email: string | null } | null;
      };

      const recentRaw = (await prisma.referral.findMany({
        where: { inviterId: uid },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          createdAt: true,
          qualifiedAt: true,
          invitee: { select: { email: true } }, // requires a `invitee` relation
        },
      })) as RecentRow[];

      recent = recentRaw.map((r: RecentRow) => ({
        id: r.id,
        inviteeEmail: r.invitee?.email ?? null,
        createdAt: r.createdAt,
        qualifiedAt: r.qualifiedAt,
      }));
    }

    // Helpful share URLs
    const base = baseUrlFrom(req);
    const shareUrl = `${base}/signup?ref=${encodeURIComponent(referralCode)}`;
    const copyText = `Join me on QwikSale! Sign up with my invite: ${shareUrl}`;
    const waText = encodeURIComponent(
      `Join me on QwikSale! Sign up with my invite: ${shareUrl}`
    );
    const whatsappShare = `https://wa.me/?text=${waText}`;
    const twitterShare = `https://twitter.com/intent/tweet?text=${waText}`;

    return noStore({
      ok: true,
      code: referralCode,
      shareUrl,
      copyText,
      share: { whatsapp: whatsappShare, twitter: twitterShare },
      counts: { invited: totalInvites, qualified: totalQualified },
      qualifiedOnUser: me.referralQualified ?? 0,
      recent,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/referrals/stats GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
