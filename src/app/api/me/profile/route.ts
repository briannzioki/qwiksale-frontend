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

const USERNAME_RE = /^(?![._])(?!.*[._]$)(?!.*[._]{2})[a-zA-Z0-9._]{3,24}$/;
function looksLikeValidUsername(u: string) {
  return USERNAME_RE.test(u);
}

const RESERVED = new Set(
  (process.env["RESERVED_USERNAMES"] || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

function normalizeName(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const s = input.trim().replace(/\s+/g, " ");
  if (!s) return ""; // allow clearing
  return s.length > 80 ? s.slice(0, 80) : s;
}

function normalizeImageUrl(input: unknown): string | null | undefined {
  if (input === null) return null;
  if (typeof input !== "string") return undefined;
  const s = input.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) return null; // treat non-url-ish as clear
  return s.length > 2048 ? s.slice(0, 2048) : s;
}

/* -------------------- KE phone helpers -------------------- */
function normalizeKePhone(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return ""; // allow clearing
  if (/^\+254(7|1)\d{8}$/.test(trimmed)) return trimmed.replace(/^\+/, ""); // -> 2547...
  let s = trimmed.replace(/\D+/g, "");
  if (/^07\d{8}$/.test(s) || /^01\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^7\d{8}$/.test(s) || /^1\d{8}$/.test(s)) s = "254" + s;
  if (s.startsWith("254") && s.length > 12) s = s.slice(0, 12);
  return s;
}
function looksLikeValidKePhone(s?: string) {
  return !!s && /^254(7|1)\d{8}$/.test(s);
}

/* ---------------------------------- GET ---------------------------------- */
export async function GET() {
  try {
    const session = await auth().catch(() => null);
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        image: true,
        whatsapp: true,
        // (Optional) include phone if you want to fall back to it:
        // phone: true,
        address: true,
        postalCode: true,
        city: true,
        country: true,
      },
    });
    if (!user) return noStore({ error: "Not found" }, { status: 404 });

    // Normalize whatsapp for output
    const normalizedWhatsapp =
      normalizeKePhone(user.whatsapp ?? "") || null;

    const profileComplete = Boolean(user.email) && Boolean(normalizedWhatsapp);

    return noStore({
      user: {
        ...user,
        whatsapp: normalizedWhatsapp,
        profileComplete,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/me/profile GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* --------------------------------- PATCH --------------------------------- */
export async function PATCH(req: Request) {
  try {
    const session = await auth().catch(() => null);
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      name?: string | null;
      username?: string | null;
      image?: string | null;
      whatsapp?: string | null;
      address?: string | null;
      postalCode?: string | null;
      city?: string | null;
      country?: string | null;
    };

    const data: Record<string, unknown> = {};

    // name (optional; allow clear)
    const normName = normalizeName(body?.name ?? undefined);
    if (normName !== undefined) data["name"] = normName || null;

    // username (optional; disallow clear)
    if (typeof body?.username === "string") {
      const username = body.username.trim();
      if (!looksLikeValidUsername(username)) {
        return noStore(
          { error: "Username must be 3–24 chars (letters, numbers, dot, underscore)." },
          { status: 400 }
        );
      }
      if (RESERVED.has(username.toLowerCase())) {
        return noStore({ error: "That username is reserved." }, { status: 409 });
      }
      const clash = await prisma.user.findFirst({
        where: {
          username: { equals: username, mode: "insensitive" },
          NOT: { id: userId },
        },
        select: { id: true },
      });
      if (clash) {
        return noStore({ error: "Username is already taken." }, { status: 409 });
      }
      data["username"] = username;
    }

    // image (optional; allow clear)
    const normImage = normalizeImageUrl(body?.image);
    if (normImage !== undefined) data["image"] = normImage;

    // whatsapp (optional; normalize/validate; allow clear)
    if (body?.whatsapp !== undefined) {
      const norm = normalizeKePhone(body.whatsapp);
      if (norm && !looksLikeValidKePhone(norm)) {
        return noStore(
          { error: "WhatsApp must be a valid KE number (07XXXXXXXX / 2547XXXXXXXX)." },
          { status: 400 }
        );
      }
      data["whatsapp"] = norm ? norm : null;
    }

    // address bits (optional; allow clear)
    if (body?.address !== undefined)
      data["address"] = body.address?.trim() ? body.address.trim() : null;
    if (body?.postalCode !== undefined)
      data["postalCode"] = body.postalCode?.trim() ? body.postalCode.trim() : null;
    if (body?.city !== undefined)
      data["city"] = body.city?.trim() ? body.city.trim() : null;
    if (body?.country !== undefined)
      data["country"] = body.country?.trim() ? body.country.trim() : null;

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

    const normalizedWhatsapp =
      normalizeKePhone(user.whatsapp ?? "") || null;
    const profileComplete = Boolean(user.email) && Boolean(normalizedWhatsapp);

    return noStore({
      ok: true,
      user: { ...user, whatsapp: normalizedWhatsapp, profileComplete },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/me/profile PATCH] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
