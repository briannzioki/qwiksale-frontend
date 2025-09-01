// src/app/api/account/complete-profile/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

/** Normalize Kenyan phone to 2547XXXXXXXX */
function normalizePhoneKenya(raw: string): string | null {
  let s = (raw || "").trim().replace(/\D+/g, "");
  if (!s) return null;
  if (/^07\d{8}$/.test(s)) s = "254" + s.slice(1);        // 07 -> 2547
  if (/^\+2547\d{8}$/.test(s)) s = s.replace(/^\+/, "");   // +2547 -> 2547
  if (/^2547\d{8}$/.test(s)) return s;
  return null;
}

function isValidEmail(email: string): boolean {
  // simple, safe check
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  // Require an authenticated user (we key updates by user.id)
  const session = await auth();
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as any));
  const { username, phone, email } = body as {
    username?: string;
    phone?: string;
    email?: string;
  };

  // Build the update payload based on what was provided
  const data: Record<string, any> = {};

  if (typeof username === "string" && username.trim()) {
    // Adjust casing policy if you prefer preserving case
    data.username = username.trim();
  }

  if (typeof phone === "string" && phone.trim()) {
    const normalized = normalizePhoneKenya(phone);
    if (!normalized) {
      return NextResponse.json(
        { error: "Invalid Kenyan phone. Use 07XXXXXXXX or 2547XXXXXXXX." },
        { status: 400 }
      );
    }
    data.phone = normalized;
    // Do NOT auto-set phoneVerified here; keep your OTP flow in charge of that.
  }

  if (typeof email === "string" && email.trim()) {
    const e = email.trim().toLowerCase();
    if (!isValidEmail(e)) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }
    data.email = e;
    // Leave emailVerified as-is; your magic-link provider will set it.
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "Nothing to update. Provide at least one of username, phone, or email." },
      { status: 400 }
    );
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        username: true,
        phone: true,
        phoneVerified: true,
      },
    });

    return NextResponse.json(
      { ok: true, user },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (e: any) {
    // Unique constraint conflict (e.g., username or phone already taken)
    if (e?.code === "P2002") {
      const target =
        Array.isArray(e.meta?.target) ? e.meta.target.join(", ") : String(e.meta?.target || "");
      return NextResponse.json({ error: `Already in use: ${target}` }, { status: 409 });
    }
    console.error("[complete-profile] POST error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
