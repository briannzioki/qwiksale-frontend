// src/app/api/account/profile/photo/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

/* -------------------------------------------------------------------------- */
/* utils                                                                       */
/* -------------------------------------------------------------------------- */

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function cloudName(): string {
  const name = (
    process.env['CLOUDINARY_CLOUD_NAME'] ??
    process.env['NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME'] ??
    ""
  ).trim();
  if (!name) throw new Error("Missing CLOUDINARY_CLOUD_NAME / NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME");
  return name;
}

/** Build canonical delivery URL from a Cloudinary publicId. */
function buildCloudinaryUrl(publicId: string) {
  const cn = cloudName();
  const pid = publicId.replace(/^\/+/, "");
  return `https://res.cloudinary.com/${cn}/image/upload/f_auto,q_auto/${encodeURI(pid)}`;
}

/** Insert a transformation immediately after `/upload/`. */
function injectTransform(baseUrl: string, t: string) {
  return baseUrl.replace("/upload/", `/upload/${t}/`);
}

function deriveVariants(baseUrl: string) {
  return {
    avatarUrl: injectTransform(baseUrl, "c_thumb,g_face,ar_1:1,w_256,h_256,f_auto,q_auto"),
    previewUrl: injectTransform(baseUrl, "c_fill,w_1024,f_auto,q_auto"),
    placeholderUrl: injectTransform(baseUrl, "w_24,e_blur:2000,q_1,f_auto"),
  };
}

/** Very light sanity check that the URL is a Cloudinary delivery URL for *your* cloud. */
function looksLikeCloudinaryUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (!/(^|\.)res\.cloudinary\.com$/.test(u.hostname)) return false;
    return u.pathname.includes(`/${cloudName()}/image/upload/`);
  } catch {
    return false;
  }
}

async function requireUserId() {
  try {
    const session = await auth();
    const uid = (session as any)?.user?.id as string | undefined;
    return typeof uid === "string" ? uid : null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* GET                                                                         */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, image: true, name: true, username: true, email: true },
  });
  if (!user) return noStore({ error: "User not found" }, { status: 404 });

  const variants = user.image && looksLikeCloudinaryUrl(user.image)
    ? deriveVariants(user.image)
    : null;

  return noStore({ ok: true, user, variants });
}

/* -------------------------------------------------------------------------- */
/* POST                                                                        */
/* -------------------------------------------------------------------------- */
/**
 * Body:
 *  - { secureUrl: "https://res.cloudinary.com/<cloud>/image/upload/.../file.jpg" }
 *    OR
 *  - { publicId:  "qwiksale/avatars/abc123" }
 *  - optional { intent: "avatar" | "raw" }
 */
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return noStore({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return noStore({ error: "Body must be a JSON object." }, { status: 400 });
  }

  const { secureUrl, publicId, intent } = body as {
    secureUrl?: unknown;
    publicId?: unknown;
    intent?: unknown;
  };

  let finalUrl: string | null = null;

  if (typeof secureUrl === "string" && secureUrl.trim()) {
    const url = secureUrl.trim();
    if (!looksLikeCloudinaryUrl(url)) {
      return noStore(
        { error: "secureUrl must be a Cloudinary URL for your cloud." },
        { status: 400 }
      );
    }
    finalUrl = url;
  } else if (typeof publicId === "string" && publicId.trim()) {
    finalUrl = buildCloudinaryUrl(publicId.trim());
  } else {
    return noStore(
      { error: "Provide either secureUrl or publicId from Cloudinary." },
      { status: 400 }
    );
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { image: finalUrl },
      select: { id: true, image: true, name: true, username: true, email: true },
    });

    const variants = user.image && looksLikeCloudinaryUrl(user.image)
      ? deriveVariants(user.image)
      : null;

    return noStore({
      ok: true,
      user,
      variants,
      meta: { intent: typeof intent === "string" ? intent : undefined },
    });
  } catch (e) {
    console.error("[profile/photo] POST error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/* DELETE                                                                      */
/* -------------------------------------------------------------------------- */

export async function DELETE() {
  const userId = await requireUserId();
  if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { image: null },
      select: { id: true, image: true, name: true, username: true, email: true },
    });

    return noStore({ ok: true, user });
  } catch (e) {
    console.error("[profile/photo] DELETE error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/* OPTIONS / HEAD                                                              */
/* -------------------------------------------------------------------------- */

export async function OPTIONS() {
  return noStore({ ok: true }, { status: 204 });
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
