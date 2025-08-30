export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { prisma } from "@/app/lib/prisma";

function normalizeKenyanPhone(raw?: string | null): string | null {
  const s0 = (raw || "").trim();
  if (!s0) return null;
  let s = s0.replace(/\D+/g, "");
  if (/^07\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^\+254(7|1)\d{8}$/.test(s)) s = s.replace(/^\+/, "");
  if (/^254(7|1)\d{8}$/.test(s)) return s;
  return null;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = (session as any)?.user?.id as string | undefined;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const username = String(body?.username || "").trim().toLowerCase();
  const whatsapp = normalizeKenyanPhone(body?.whatsapp);
  const city = body?.city ? String(body.city).trim() : null;
  const country = body?.country ? String(body.country).trim() : null;
  const postalCode = body?.postalCode ? String(body.postalCode).trim() : null;
  const address = body?.address ? String(body.address).trim() : null;

  if (!/^[a-z0-9_\.]{3,20}$/i.test(username)) {
    return NextResponse.json({ error: "Invalid username" }, { status: 400 });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: uid },
      data: {
        username,
        whatsapp: whatsapp || null,
        city,
        country,
        postalCode,
        address,
      },
      select: { id: true, username: true },
    });

    return NextResponse.json({ ok: true, user: updated }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    if (e?.code === "P2002") {
      // unique constraint (likely username)
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }
    console.error("[profile/setup] error", e);
    return NextResponse.json({ error: "Failed to save profile" }, { status: 500 });
  }
}
