export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    const sessionId = (session as any)?.user?.id as string | undefined;
    const email = session?.user?.email || undefined;

    if (!sessionId && !email) {
      return noStore({ error: "Unauthorized" }, { status: 401 });
    }

    let userId = sessionId;
    if (!userId && email) {
      const row = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      userId = row?.id;
    }
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const form = await req.formData().catch(() => null);
    const file = form?.get("file") as File | null;
    if (!file) return noStore({ error: "Missing file" }, { status: 400 });

    const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const preset = process.env.NEXT_PUBLIC_CLOUDINARY_PRESET_AVATARS;
    if (!cloud || !preset) {
      return noStore({ error: "Cloudinary not configured" }, { status: 500 });
    }

    // Forward the upload to Cloudinary
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", preset);
    fd.append("folder", "qwiksale/avatars");

    const cloudinaryEndpoint = `https://api.cloudinary.com/v1_1/${cloud}/image/upload`;
    const up = await fetch(cloudinaryEndpoint, { method: "POST", body: fd });
    const cj = await up.json().catch(() => ({}));

    if (!up.ok || !cj?.secure_url) {
      return noStore({ error: cj?.error?.message || "Upload failed" }, { status: 502 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { image: cj.secure_url as string },
      select: { image: true },
    });

    return noStore({ ok: true, url: updated.image });
  } catch (e) {
    console.warn("[profile photo POST] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
