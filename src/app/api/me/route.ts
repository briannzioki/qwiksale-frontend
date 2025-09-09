// src/app/api/me/profile/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function looksLikeValidUsername(u: string) {
  return /^[a-zA-Z0-9._]{3,24}$/.test(u);
}

function normalizeName(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const s = input.trim().replace(/\s+/g, " ");
  if (!s) return ""; // allow clearing; change to `undefined` to ignore empties
  return s.slice(0, 80);
}

/** Normalize Kenyan MSISDN → `2547XXXXXXXX` / `2541XXXXXXXX` */
function normalizeKePhone(raw: unknown): string | null | undefined {
  if (raw == null) return undefined; // not present → ignore
  if (typeof raw !== "string") return undefined;
  let s = raw.trim();
  if (!s) return null; // explicit clear
  if (/^\+254(7|1)\d{8}$/.test(s)) s = s.replace(/^\+/, "");
  s = s.replace(/\D+/g, "");
  if (/^07\d{8}$/.test(s) || /^01\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^7\d{8}$/.test(s) || /^1\d{8}$/.test(s)) s = "254" + s;
  if (s.startsWith("254") && s.length > 12) s = s.slice(0, 12);
  return /^254(7|1)\d{8}$/.test(s) ? s : null; // null = provided but invalid
}

function clampStr(v: unknown, max: number): string | null | undefined {
  if (v == null) return undefined; // not present → ignore
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return null; // explicit clear
  return t.length > max ? t.slice(0, max) : t;
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      username?: string;
      whatsapp?: string;    // ← NEW
      address?: string;     // ← NEW
      postalCode?: string;  // ← NEW
      city?: string;        // ← NEW
      country?: string;     // ← NEW
      // image is updated via /api/account/profile/photo
    };

    // Build patch object using index signature
    const data: Record<string, unknown> = {};

    // name (optional; allow clear)
    const normName = normalizeName(body?.name);
    if (normName !== undefined) data["name"] = normName;

    // username (optional) + uniqueness
    if (typeof body?.username === "string") {
      const username = body.username.trim();
      if (!looksLikeValidUsername(username)) {
        return noStore(
          { error: "Username must be 3–24 chars (letters, numbers, dot, underscore)." },
          { status: 400 }
        );
      }
      const clash = await prisma.user.findFirst({
        where: { username: { equals: username, mode: "insensitive" }, NOT: { id: userId } },
        select: { id: true },
      });
      if (clash) return noStore({ error: "Username is already taken." }, { status: 409 });
      data["username"] = username;
    }

    // whatsapp (optional; allow clear; validate KE format)
    const normPhone = normalizeKePhone(body?.whatsapp);
    if (normPhone !== undefined) {
      if (normPhone === null) {
        return noStore(
          { error: "WhatsApp must be a valid KE number (07/01… or 2547/2541… or +2547/+2541…)." },
          { status: 400 }
        );
      }
      data["whatsapp"] = normPhone; // stored as digits (no +)
    }

    // address fields (optional; allow clear)
    const address = clampStr(body?.address, 200);
    const postalCode = clampStr(body?.postalCode, 20);
    const city = clampStr(body?.city, 80);
    const country = clampStr(body?.country, 80);

    if (address !== undefined) data["address"] = address;
    if (postalCode !== undefined) data["postalCode"] = postalCode;
    if (city !== undefined) data["city"] = city;
    if (country !== undefined) data["country"] = country;

    if (Object.keys(data).length === 0) {
      return noStore({ error: "Nothing to update." }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        image: true,
        whatsapp: true,
        address: true,
        postalCode: true,
        city: true,
        country: true,
      },
    });

    return noStore({ ok: true, user });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/me/profile PATCH] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
