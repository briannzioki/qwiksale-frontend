export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "@/app/lib/auth";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const preset =
      process.env.CLOUDINARY_UPLOAD_PRESET_AVATAR || "avatars_unsigned";
    const folder = process.env.CLOUDINARY_FOLDER_AVATARS || "qwiksale/avatars";

    if (!cloudName || !preset) {
      return noStore(
        { error: "Cloudinary is not configured (cloud name / preset missing)." },
        { status: 500 }
      );
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return noStore({ error: "No file provided" }, { status: 400 });

    // Basic server-side validation
    if (!/^image\//.test(file.type)) {
      return noStore({ error: "Only image files are allowed" }, { status: 400 });
    }
    if (file.size > 2 * 1024 * 1024) {
      return noStore({ error: "Max file size is 2MB" }, { status: 400 });
    }

    // Prepare Cloudinary upload request
    const cloudForm = new FormData();
    cloudForm.append("file", file);
    cloudForm.append("upload_preset", preset);
    if (folder) cloudForm.append("folder", folder);
    // If your preset requires/permits any transformations, you can also append them here.
    // Otherwise rely on the preset’s default "Incoming transformation".

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: "POST", body: cloudForm }
    );

    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || !data?.secure_url) {
      return noStore(
        { error: data?.error?.message || "Cloudinary upload failed" },
        { status: 400 }
      );
    }

    // Save avatar URL on the user
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { image: data.secure_url },
      select: { id: true, image: true },
    });

    return noStore({ ok: true, url: updated.image, publicId: data.public_id });
  } catch (e) {
    console.error("[avatar upload] error", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
