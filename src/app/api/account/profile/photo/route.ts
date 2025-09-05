// src/app/api/account/profile/photo/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

// ---- helpers ---------------------------------------------------------------

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function cloudName(): string {
  const name = process.env.CLOUDINARY_CLOUD_NAME;
  if (!name) throw new Error("Missing CLOUDINARY_CLOUD_NAME env var");
  return name;
}

/**
 * Build a canonical Cloudinary delivery URL from a publicId.
 * We keep it simple and rely on Cloudinary's smart format/quality.
 */
function buildCloudinaryUrl(publicId: string) {
  const cn = cloudName();
  // Ensure no leading slash on publicId
  const pid = publicId.replace(/^\/+/, "");
  return `https://res.cloudinary.com/${cn}/image/upload/f_auto,q_auto/${encodeURI(pid)}`;
}

/**
 * Given a base delivery URL from Cloudinary, derive some helpful variants.
 * We do not persist these; the client can use them directly for UI.
 */
function deriveVariants(baseUrl: string) {
  // Insert transformations right after `/upload/`
  const inject = (t: string) => baseUrl.replace("/upload/", `/upload/${t}/`);

  // Square avatar (cover) + web-friendly preview + super-low LQIP placeholder
  const avatarUrl = inject("c_thumb,g_face,ar_1:1,w_256,h_256,f_auto,q_auto");
  const previewUrl = inject("c_fill,w_1024,f_auto,q_auto");
  const placeholderUrl = inject("w_24,e_blur:2000,q_1,f_auto");

  return { avatarUrl, previewUrl, placeholderUrl };
}

/**
 * Very light sanity check for Cloudinary delivery URLs for your cloud.
 */
function looksLikeCloudinaryUrl(url: string) {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      /(^|\.)res\.cloudinary\.com$/.test(u.hostname) &&
      u.pathname.includes(`/${cloudName()}/image/upload/`)
    );
  } catch {
    return false;
  }
}

// ---- method handlers -------------------------------------------------------

export async function GET() {
  const session = await auth();
  const userId = (session as any)?.user?.id as string | undefined;
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

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return noStore({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return noStore({ error: "Body must be a JSON object." }, { status: 400 });
  }

  const {
    secureUrl,
    publicId,
  }: {
    secureUrl?: unknown;
    publicId?: unknown;
  } = body as any;

  // Accept EITHER a Cloudinary secureUrl OR a publicId (from unsigned upload)
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

    const variants = deriveVariants(user.image ?? finalUrl!);

    return noStore({ ok: true, user, variants });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[profile/photo] POST error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await auth();
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { image: null as any }, // NextAuth User.image is string | null
      select: { id: true, image: true, name: true, username: true, email: true },
    });

    // NOTE: We are not deleting from Cloudinary here because your setup uses an
    // unsigned preset (no server-side API key/secret). If/when you add the
    // authenticated Admin API, we can securely destroy the previous publicId.
    return noStore({ ok: true, user });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[profile/photo] DELETE error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
