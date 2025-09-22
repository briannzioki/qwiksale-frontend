// src/app/api/referrals/stats/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

/* ----------------------------- helpers ----------------------------- */
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function hasValidDbUrl(): boolean {
  const u = process.env["DATABASE_URL"] ?? "";
  return /^postgres(ql)?:\/\//i.test(u);
}

function makeCodeFrom(username?: string | null): string {
  const base = (username || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base || "qs"}-${rand}`;
}

/**
 * Atomically set referralCode if null.
 * Uses SQL `UPDATE ... WHERE referralCode IS NULL RETURNING` (Postgres).
 * Falls back to retrying Prisma updates on unique conflicts.
 */
async function ensureReferralCodeAtomic(userId: string, username?: string | null) {
  // short-circuit
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (current?.referralCode) return current.referralCode;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCodeFrom(username);
    try {
      // Prefer a single-shot SQL update when provider is Postgres
      const rowsRaw = await prisma.$queryRaw<Array<{ referralCode: string }>>`
        UPDATE "User"
        SET "referralCode" = ${code}
        WHERE "id" = ${userId} AND "referralCode" IS NULL
        RETURNING "referralCode"
      `;
      const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
      if (rows.length > 0 && typeof rows[0]?.referralCode === "string") {
        return rows[0].referralCode;
      }

      // Maybe another request raced and set it — re-check
      const after = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
      if (after?.referralCode) return after.referralCode;
      continue; // still null: try again with a new random code
    } catch (e: any) {
      if (e?.code === "P2002") { // unique constraint clash on referralCode
        lastErr = e;
        continue;
      }
      throw e;
    }
  }

  // Final re-check
  const final = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (final?.referralCode) return final.referralCode;
  throw lastErr || new Error("Failed to assign referral code");
}

function baseUrlFrom(req: NextRequest): string {
  const envUrl =
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["NEXT_PUBLIC_SITE_URL"] ||
    process.env["APP_URL"] ||
    "";
  if (envUrl) return envUrl.replace(/\/+$/, "");

  const proto = req.headers.get("x-forwarded-proto") || (process.env.NODE_ENV === "production" ? "https" : "http");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

/* --------------------------------- GET --------------------------------- */
/**
 * GET /api/referrals/stats
 * Returns caller’s referral code (creating if missing) + counts.
 * Optional: `?include=recent` adds up to 20 latest referrals.
 */
export async function GET(req: NextRequest) {
  if (!hasValidDbUrl()) {
    return noStore({
      ok: true,
      code: null,
      shareUrl: null,
      copyText: null,
      share: { whatsapp: null, twitter: null },
      counts: { invited: 0, qualified: 0 },
      qualifiedOnUser: 0,
      recent: [],
      note: "no-database-url",
    });
  }

  try {
    const session = await auth();
    const uid = (session as any)?.user?.id as string | undefined;
    if (!uid) return noStore({ error: "Unauthorized" }, { status: 401 });

    const includeRecent = (new URL(req.url).searchParams.get("include") || "")
      .toLowerCase()
      .includes("recent");

    // Minimal user info
    const me = await prisma.user.findUnique({
      where: { id: uid },
      select: { id: true, username: true, referralCode: true, referralQualified: true },
    });
    if (!me) return noStore({ error: "Not found" }, { status: 404 });

    // Ensure referral code
    const referralCode = me.referralCode || (await ensureReferralCodeAtomic(me.id, me.username));

    // Counts
    const [totalInvites, totalQualified] = await Promise.all([
      (prisma as any).referral?.count?.({ where: { inviterId: uid } }) ?? 0,
      (prisma as any).referral?.count?.({ where: { inviterId: uid, qualifiedAt: { not: null } } }) ?? 0,
    ]);

    // Optional recent (try with relation; fall back if schema differs)
    let recent:
      | Array<{ id: string; inviteeEmail: string | null; createdAt: string; qualifiedAt: string | null }>
      | undefined;

    if (includeRecent) {
      type RecentRow = {
        id: string;
        createdAt: Date;
        qualifiedAt: Date | null;
        invitee?: { email: string | null } | null;
        inviteeEmail?: string | null; // fallback column if relation missing
      };

      let recentRaw: RecentRow[] = [];
      try {
        recentRaw = (await (prisma as any).referral.findMany({
          where: { inviterId: uid },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            createdAt: true,
            qualifiedAt: true,
            invitee: { select: { email: true } },
          },
        })) as RecentRow[];
      } catch {
        // Fallback: no relation, try a plain column
        try {
          recentRaw = (await (prisma as any).referral.findMany({
            where: { inviterId: uid },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: { id: true, createdAt: true, qualifiedAt: true, inviteeEmail: true },
          })) as RecentRow[];
        } catch {
          recentRaw = [];
        }
      }

      recent = recentRaw.map((r) => ({
        id: r.id,
        inviteeEmail: (r.invitee?.email ?? r.inviteeEmail) ?? null,
        createdAt: r.createdAt.toISOString(),
        qualifiedAt: r.qualifiedAt ? r.qualifiedAt.toISOString() : null,
      }));
    }

    const base = baseUrlFrom(req);
    const shareUrl = `${base}/signup?ref=${encodeURIComponent(referralCode)}`;
    const copyText = `Join me on QwikSale! Sign up with my invite: ${shareUrl}`;
    const waText = encodeURIComponent(copyText);
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


