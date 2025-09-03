export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

function makeCodeFrom(username?: string | null): string {
  const base = (username || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  const rand = Math.random().toString(36).slice(2, 8);
  return (base ? base : "qs") + "-" + rand;
}

export async function GET() {
  const session = await auth();
  const uid = (session as any)?.user?.id as string | undefined;
  if (!uid) return noStore({ error: "Unauthorized" }, { status: 401 });

  // Ensure user has a code
  let me = await prisma.user.findUnique({
    where: { id: uid },
    select: { id: true, username: true, referralCode: true, referralQualified: true },
  });
  if (!me) return noStore({ error: "Not found" }, { status: 404 });

  if (!me.referralCode) {
    const newCode = makeCodeFrom(me.username);
    me = await prisma.user.update({
      where: { id: uid },
      data: { referralCode: newCode },
      select: { id: true, username: true, referralCode: true, referralQualified: true },
    });
  }

  // Totals from events
  const [totalInvites, totalQualified] = await Promise.all([
    prisma.referral.count({ where: { inviterId: uid } }),
    prisma.referral.count({ where: { inviterId: uid, qualifiedAt: { not: null } } }),
  ]);

  return noStore({
    code: me.referralCode,
    counts: { invited: totalInvites, qualified: totalQualified },
    qualifiedOnUser: me.referralQualified, // mirror (optional)
  });
}
