// src/app/api/me/profile/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import {
  buildSellerBadgeFields,
  resolveSellerBadgeFieldsFromUserLike,
  sellerVerifiedFromEmailVerified,
  type FeaturedTier,
} from "@/app/lib/sellerVerification";

const SHOULD_LOG = process.env.NODE_ENV === "development" && process.env["API_DEBUG"] === "1";

function warn(...args: any[]) {
  if (!SHOULD_LOG) return;
  // eslint-disable-next-line no-console
  console.warn(...args);
}

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
  return res;
}

function normalizeFeaturedTier(v: unknown): FeaturedTier | null {
  const t = String(v ?? "").trim().toLowerCase();
  if (!t) return null;
  if (t.includes("diamond")) return "diamond";
  if (t.includes("gold")) return "gold";
  if (t.includes("basic") || t.includes("free") || t.includes("starter")) return "basic";
  return null;
}

function coerceTierFromBadges(badges: any): FeaturedTier | null {
  const t1 = normalizeFeaturedTier(badges?.sellerFeaturedTier);
  if (t1) return t1;
  return normalizeFeaturedTier(badges?.sellerBadges?.tier);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^(?![._])(?!.*[._]$)(?!.*[._]{2})[a-zA-Z0-9._]{3,24}$/;
const RESERVED = new Set(
  (process.env["RESERVED_USERNAMES"] || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

const looksLikeEmail = (e?: string) => !!e && EMAIL_RE.test(e.trim().toLowerCase());
const looksLikeValidUsername = (u: string) => USERNAME_RE.test(u);

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
  if (!/^https?:\/\//i.test(s)) return null;
  return s.length > 2048 ? s.slice(0, 2048) : s;
}

/* -------------------- KE phone helpers -------------------- */
function normalizeKePhone(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (!t) return ""; // allow clearing

  if (/^\+254(7|1)\d{8}$/.test(t)) return t.replace(/^\+/, "");

  let s = t.replace(/\D+/g, "");
  if (/^07\d{8}$/.test(s) || /^01\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^7\d{8}$/.test(s) || /^1\d{8}$/.test(s)) s = "254" + s;
  if (s.startsWith("254") && s.length > 12) s = s.slice(0, 12);
  return s;
}
const looksLikeValidKePhone = (s?: string) => !!s && /^254(7|1)\d{8}$/.test(s);

function looksLikeGoogleMapsUrl(input: string): boolean {
  const s = String(input || "").trim();
  if (!s) return false;

  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return false;
  }

  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();

  return (
    host === "maps.google.com" ||
    (host.endsWith(".google.com") && path.includes("/maps")) ||
    (host === "goo.gl" && path.startsWith("/maps")) ||
    (host.endsWith(".goo.gl") && path.includes("/maps"))
  );
}

/* ---------------------------------- GET ---------------------------------- */
export async function GET() {
  try {
    const session = await auth().catch(() => null);
    const sessionUser = (session as any)?.user || null;

    let userId: string | undefined = (sessionUser?.id as string | undefined) || undefined;

    if (!userId && sessionUser?.email) {
      try {
        const u = await prisma.user.findUnique({
          where: { email: sessionUser.email as string },
          select: { id: true },
        });
        userId = u?.id;
      } catch {
        // ignore
      }
    }

    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        username: true,
        name: true,
        image: true,
        whatsapp: true,
        address: true,
        postalCode: true,
        city: true,
        country: true,
        storeLocationUrl: true,
        verified: true,
      },
    });

    if (!user) return noStore({ error: "Not found" }, { status: 404 });

    const normalizedWhatsapp = normalizeKePhone(user.whatsapp ?? "") || null;
    const profileComplete = Boolean(user.email) && Boolean(normalizedWhatsapp);

    const sellerVerified = sellerVerifiedFromEmailVerified(user.emailVerified);

    let badges: any = buildSellerBadgeFields(sellerVerified, null);
    try {
      const rows = await prisma.$queryRaw<{ u: any }[]>`
        SELECT row_to_json(u) as u
        FROM "User" u
        WHERE u.id = ${user.id}
        LIMIT 1
      `;
      const u = rows?.[0]?.u ?? null;
      if (u) badges = resolveSellerBadgeFieldsFromUserLike(u) as any;
    } catch {
      // keep defaults
    }

    const tierCanon = coerceTierFromBadges(badges);
    const badgeOut: any = { ...(badges as any) };
    badgeOut.sellerVerified = sellerVerified;
    badgeOut.sellerFeaturedTier = tierCanon;
    badgeOut.sellerBadges = { verified: sellerVerified, tier: tierCanon };

    return noStore({
      user: {
        ...user,
        // Keep legacy mirrors for other UI that expects these fields
        sellerVerified: badgeOut.sellerVerified,
        sellerFeaturedTier: badgeOut.sellerFeaturedTier,
        sellerBadges: badgeOut.sellerBadges,
        isVerified: badgeOut.isVerified,
        seller_verified: badgeOut.seller_verified,
        email_verified: user.emailVerified,
        whatsapp: normalizedWhatsapp,
        profileComplete,
      },
    });
  } catch (e) {
    warn("[/api/me/profile GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* --------------------------------- PATCH --------------------------------- */
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth().catch(() => null);
    const sessionUser = (session as any)?.user || null;

    let userId: string | undefined = (sessionUser?.id as string | undefined) || undefined;

    if (!userId && sessionUser?.email) {
      try {
        const u = await prisma.user.findUnique({
          where: { email: sessionUser.email as string },
          select: { id: true },
        });
        userId = u?.id;
      } catch {
        // ignore
      }
    }

    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerified: true,
      },
    });

    if (!me) return noStore({ error: "Not found" }, { status: 404 });

    const body = (await req.json().catch(() => ({}))) as {
      name?: string | null;
      email?: string | null;
      username?: string | null;
      image?: string | null;
      whatsapp?: string | null;
      address?: string | null;
      postalCode?: string | null;
      city?: string | null;
      country?: string | null;
      storeLocationUrl?: string | null;
    };

    const data: Record<string, unknown> = {};

    const normName = normalizeName(body?.name ?? undefined);
    if (normName !== undefined) data["name"] = normName || null;

    if (typeof body?.email === "string") {
      const nextEmail = body.email.trim().toLowerCase();
      if (!looksLikeEmail(nextEmail)) {
        return noStore({ error: "Invalid email address." }, { status: 400 });
      }

      const changed = nextEmail !== (me.email ?? "").toLowerCase();

      if (changed) {
        const clash = await prisma.user.findFirst({
          where: {
            email: { equals: nextEmail, mode: "insensitive" },
            NOT: { id: me.id },
          },
          select: { id: true },
        });

        if (clash) {
          return noStore({ error: "Email already in use" }, { status: 409 });
        }

        data["email"] = nextEmail;
        if (typeof me.emailVerified !== "undefined") {
          data["emailVerified"] = null;
        }
      }
    }

    if (typeof body?.username === "string") {
      const username = body.username.trim();

      if (!looksLikeValidUsername(username)) {
        return noStore(
          {
            error:
              "Username must be 3–24 chars (letters, numbers, ., _), no leading/trailing dot/underscore, no doubles.",
          },
          { status: 400 },
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

    const normImage = normalizeImageUrl(body?.image);
    if (normImage !== undefined) data["image"] = normImage;

    if (body?.whatsapp !== undefined) {
      const norm = normalizeKePhone(body.whatsapp);
      if (norm && !looksLikeValidKePhone(norm)) {
        return noStore(
          { error: "WhatsApp must be a valid KE number (07XXXXXXXX / 2547XXXXXXXX)." },
          { status: 400 },
        );
      }
      data["whatsapp"] = norm ? norm : null;
    }

    if (body?.address !== undefined) data["address"] = body.address?.trim() || null;
    if (body?.postalCode !== undefined) data["postalCode"] = body.postalCode?.trim() || null;
    if (body?.city !== undefined) data["city"] = body.city?.trim() || null;
    if (body?.country !== undefined) data["country"] = body.country?.trim() || null;

    if (typeof body?.storeLocationUrl === "string") {
      const raw = body.storeLocationUrl.trim();
      if (!raw) {
        data["storeLocationUrl"] = null;
      } else {
        if (!looksLikeGoogleMapsUrl(raw)) {
          return noStore(
            { error: "Store location URL must be a Google Maps link (maps.google.com or goo.gl/maps)." },
            { status: 400 },
          );
        }
        data["storeLocationUrl"] = raw.length > 2048 ? raw.slice(0, 2048) : raw;
      }
    }

    // ✅ If no changes, still return current user (so UI can show a success/notice if you want)
    if (Object.keys(data).length === 0) {
      const current = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          emailVerified: true,
          username: true,
          name: true,
          image: true,
          whatsapp: true,
          address: true,
          postalCode: true,
          city: true,
          country: true,
          storeLocationUrl: true,
          verified: true,
        },
      });
      return noStore({ ok: true, user: current }, { status: 200 });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        emailVerified: true,
        username: true,
        name: true,
        image: true,
        whatsapp: true,
        address: true,
        postalCode: true,
        city: true,
        country: true,
        storeLocationUrl: true,
        verified: true,
      },
    });

    const normalizedWhatsapp = normalizeKePhone(user.whatsapp ?? "") || null;
    const profileComplete = Boolean(user.email) && Boolean(normalizedWhatsapp);

    const sellerVerified = sellerVerifiedFromEmailVerified(user.emailVerified);

    let badges: any = buildSellerBadgeFields(sellerVerified, null);
    try {
      const rows = await prisma.$queryRaw<{ u: any }[]>`
        SELECT row_to_json(u) as u
        FROM "User" u
        WHERE u.id = ${user.id}
        LIMIT 1
      `;
      const u = rows?.[0]?.u ?? null;
      if (u) badges = resolveSellerBadgeFieldsFromUserLike(u) as any;
    } catch {
      // keep defaults
    }

    const tierCanon = coerceTierFromBadges(badges);
    const badgeOut: any = { ...(badges as any) };
    badgeOut.sellerVerified = sellerVerified;
    badgeOut.sellerFeaturedTier = tierCanon;
    badgeOut.sellerBadges = { verified: sellerVerified, tier: tierCanon };

    return noStore({
      ok: true,
      user: {
        ...user,
        sellerVerified: badgeOut.sellerVerified,
        sellerFeaturedTier: badgeOut.sellerFeaturedTier,
        sellerBadges: badgeOut.sellerBadges,
        isVerified: badgeOut.isVerified,
        seller_verified: badgeOut.seller_verified,
        email_verified: user.emailVerified,
        whatsapp: normalizedWhatsapp,
        profileComplete,
      },
    });
  } catch (e) {
    warn("[/api/me/profile PATCH] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      Vary: "Authorization, Cookie, Accept-Encoding",
      Allow: "GET,PATCH,OPTIONS",
    },
  });
}
