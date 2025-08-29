export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { prisma } from "@/app/lib/prisma";
import { normalizeKenyanPhone } from "@/app/lib/phone";

export async function POST(req: Request) {
  // Must be logged in – this endpoint LINKS a phone to the current user
  const session = await getServerSession(authOptions);
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse body
  const { identifier, code } = await req.json().catch(() => ({} as any));

  // Normalize phone (accept 07/01, 2547/2541, +2547/+2541)
  const phone = normalizeKenyanPhone(String(identifier || ""));
  const codeStr = String(code || "").trim();

  if (!phone) {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }
  if (!/^\d{6}$/.test(codeStr)) {
    return NextResponse.json({ error: "Invalid code format" }, { status: 400 });
  }

  const idKey = `tel:${phone}`;

  // Look up token by composite unique key
  const vt = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier: idKey, token: codeStr } },
  });

  if (!vt || vt.expires < new Date()) {
    // Best-effort consume to avoid replay (ignore errors)
    await prisma.verificationToken
      .delete({ where: { identifier_token: { identifier: idKey, token: codeStr } } })
      .catch(() => {});
    return NextResponse.json({ error: "Code invalid or expired" }, { status: 400 });
  }

  try {
    // Attach phone and mark verified
    await prisma.user.update({
      where: { id: userId },
      data: { phone, phoneVerified: true, verified: true },
    });

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    // Unique violation -> phone already belongs to someone else
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Phone already in use" }, { status: 409 });
    }
    console.error("[otp/verify] unexpected", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  } finally {
    // Always consume the token to prevent reuse
    await prisma.verificationToken
      .delete({ where: { identifier_token: { identifier: idKey, token: codeStr } } })
      .catch(() => {});
  }
}
