// src/app/api/me/profile/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "@/app/lib/auth";

/* ---------------- utilities ---------------- */

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

function s(v: unknown, max?: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return undefined;
  return typeof max === "number" ? t.slice(0, max) : t;
}

function looksLikeValidUsername(u?: string) {
  if (!u) return false;
  return /^[a-zA-Z0-9._]{3,24}$/.test(u);
}

/** Normalize Kenyan MSISDN to `2547XXXXXXXX` or `2541XXXXXXXX`. */
function normalizeMsisdn(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  let raw = input.trim();
  if (!raw) return undefined;

  // Already +2547… / +2541…
  if (/^\+254(7|1)\d{8}$/.test(raw)) raw = raw.replace(/^\+/, "");

  // Strip non-digits
  let s = raw.replace(/\D+/g, "");

  // 07… / 01… -> 2547… / 2541…
  if (/^07\d{8}$/.test(s) || /^01\d{8}$/.test(s)) s = "254" + s.slice(1);

  // 7…… or 1…… -> 2547… / 2541…
  if (/^7\d{8}$/.test(s) || /^1\d{8}$/.test(s)) s = "254" + s;

  // Truncate any accidental extra digits
  if (s.startsWith("254") && s.length > 12) s = s.slice(0, 12);

  return s || undefined;
}

const MAX = {
  name: 120,
  username: 24,
  image: 2048,
  address: 200,
  postalCode: 32,
  city: 80,
  country: 80,
} as const;

/* ---------------- PATCH /api/me/profile ---------------- */

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession();
    const uid = (session as any)?.user?.id as string | undefined;
    const email = session?.user?.email || undefined;

    if (!uid && !email) {
      return noStore({ error: "Unauthorized" }, { status: 401 });
    }

    // Resolve to a concrete user id (some sessions might lack uid)
    let userId = uid;
    if (!userId && email) {
      const row = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      userId = row?.id;
    }
    if (!userId) {
      return noStore({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse body
    const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Helper: allow null to explicitly clear a field; undefined means "no change"
    const strOrNull = (key: keyof typeof MAX, max: number) => {
      if (key in raw && raw[key] === null) return null as string | null;
      const v = s(raw[key], max);
      return v === undefined ? undefined : v;
    };

    const name = strOrNull("name", MAX.name);
    const username = strOrNull("username", MAX.username);
    const image = strOrNull("image", MAX.image);
    const address = strOrNull("address", MAX.address);
    const postalCode = strOrNull("postalCode", MAX.postalCode);
    const city = strOrNull("city", MAX.city);
    const country = strOrNull("country", MAX.country);

    // whatsapp needs special handling for normalization/null
    let whatsapp: string | null | undefined = undefined;
    if ("whatsapp" in raw) {
      if (raw.whatsapp === null) {
        whatsapp = null; // explicit clear
      } else if (typeof raw.whatsapp === "string") {
        const n = normalizeMsisdn(raw.whatsapp);
        whatsapp = n ?? undefined; // set if valid, else ignore
      } else {
        whatsapp = undefined;
      }
    }

    if (username && !looksLikeValidUsername(username)) {
      return noStore(
        { error: "Invalid username. Use 3–24 chars: letters, numbers, dot or underscore." },
        { status: 400 }
      );
    }

    // Build update payload (keep nulls to allow clearing; drop only undefined)
    const data: Record<string, unknown> = {
      name,
      username,
      image,
      whatsapp,
      address,
      postalCode,
      city,
      country,
    };
    Object.keys(data).forEach((k) => (data as any)[k] === undefined && delete (data as any)[k]);

    if (Object.keys(data).length === 0) {
      return noStore({ error: "No fields to update" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        username: true,
        whatsapp: true,
        address: true,
        postalCode: true,
        city: true,
        country: true,
      },
    });

    // Session JWT claims update on the next refresh interval or sign-in.
    return noStore({ ok: true, user: updated });
  } catch (e: any) {
    if (e?.code === "P2002") {
      // Unique constraint violation (likely username)
      return noStore({ error: "Username already taken" }, { status: 409 });
    }
    if (e?.code === "P2025") {
      // Record to update not found
      return noStore({ error: "User not found" }, { status: 404 });
    }
    console.error("[profile PATCH] Error", e);
    return noStore({ error: "Failed to save profile" }, { status: 500 });
  }
}
