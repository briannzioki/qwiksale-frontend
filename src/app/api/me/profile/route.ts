export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "@/app/lib/auth";

/* --------- helpers --------- */
function normalizeKePhone(raw?: string | null): string | null {
  const s0 = (raw || "").trim();
  if (!s0) return null;
  let s = s0.replace(/\D+/g, "");
  if (/^07\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^\+254(7|1)\d{8}$/.test(s)) s = s.replace(/^\+/, "");
  if (/^254(7|1)\d{8}$/.test(s)) return s;
  return null;
}

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

export async function PATCH(req: Request) {
  const session = await getServerSession();
  const uid = (session as any)?.user?.id as string | undefined;
  const email = session?.user?.email ?? undefined;

  if (!uid && !email) {
    return noStore({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    username?: string | null;
    whatsapp?: string | null;
    address?: string | null;
    postalCode?: string | null;
    city?: string | null;
    country?: string | null;
  };

  const data = {
    username: body.username?.trim() || null,
    whatsapp: normalizeKePhone(body.whatsapp),
    address: body.address?.trim() || null,
    postalCode: body.postalCode?.trim() || null,
    city: body.city?.trim() || null,
    country: body.country?.trim() || null,
  };

  // choose a stable where clause; prefer id, else email
  const where = uid ? { id: uid } : { email: email! };

  try {
    // make sure the user exists first (avoid P2025 throwing 500)
    const exists = await prisma.user.findUnique({ where, select: { id: true } });
    if (!exists) {
      return noStore({ error: "Please sign in again." }, { status: 401 });
    }

    const user = await prisma.user.update({
      where,
      data,
      select: { id: true, username: true },
    });

    return noStore({ ok: true, user });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return noStore({ error: "Username already in use" }, { status: 409 });
    }
    if (e?.code === "P2025") {
      // record-not-found: treat as auth drift
      return noStore({ error: "Account not found. Please sign in again." }, { status: 401 });
    }
    console.error("[profile PATCH]", e);
    return noStore({ error: "Failed to update profile" }, { status: 500 });
  }
}
