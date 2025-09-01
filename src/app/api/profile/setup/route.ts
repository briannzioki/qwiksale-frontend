// src/app/api/profile/setup/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

function normalizeKenyanPhone(raw?: string | null): string | null {
  const s0 = (raw || "").trim();
  if (!s0) return null;
  let s = s0.replace(/\D+/g, "");
  if (/^07\d{8}$/.test(s)) s = "254" + s.slice(1); // 07XXXXXXXX → 2547XXXXXXXX
  if (/^\+254(7|1)\d{8}$/.test(s)) s = s.replace(/^\+/, ""); // +2547/1XXXXXXX → 2547/1XXXXXXX
  if (/^254(7|1)\d{8}$/.test(s)) return s;
  return null;
}

export async function POST(req: Request) {
  // Auth (NextAuth v5 centralized helper)
  const session = await auth();
  const uid = (session as any)?.user?.id as string | undefined;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    username?: unknown;
    whatsapp?: unknown;
    city?: unknown;
    country?: unknown;
    postalCode?: unknown;
    address?: unknown;
  };

  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const whatsapp = normalizeKenyanPhone(
    typeof body.whatsapp === "string" ? body.whatsapp : null
  );
  const city = typeof body.city === "string" ? body.city.trim() : null;
  const country = typeof body.country === "string" ? body.country.trim() : null;
  const postalCode = typeof body.postalCode === "string" ? body.postalCode.trim() : null;
  const address = typeof body.address === "string" ? body.address.trim() : null;

  if (!/^[a-z0-9_.]{3,20}$/i.test(username)) {
    return NextResponse.json({ error: "Invalid username" }, { status: 400 });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: uid },
      data: {
        username,
        whatsapp: whatsapp || null, // keep null if invalid/empty
        city,
        country,
        postalCode,
        address,
      },
      select: { id: true, username: true },
    });

    return NextResponse.json(
      { ok: true, user: updated },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (e: any) {
    if (e?.code === "P2002") {
      // unique constraint (likely username)
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }
    console.error("[profile/setup] error", e);
    return NextResponse.json({ error: "Failed to save profile" }, { status: 500 });
  }
}
