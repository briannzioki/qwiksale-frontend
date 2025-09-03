export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return noStore({ error: "Missing file" }, { status: 400 });
    if (!file.type?.startsWith("image/")) {
      return noStore({ error: "Only image files are allowed" }, { status: 400 });
    }
    if (file.size > 2 * 1024 * 1024) {
      return noStore({ error: "Max file size is 2MB" }, { status: 400 });
    }

    const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const preset =
      process.env.NEXT_PUBLIC_CLOUDINARY_PRESET_AVATARS ||
      process.env.CLOUDINARY_UPLOAD_PRESET_AVATAR; // fallback
    const folder =
      process.env.CLOUDINARY_UPLOAD_FOLDER_AVATARS || "qwiksale/avatars";

    if (!cloud || !preset) {
      return noStore(
        {
          error:
            "Cloudinary is not configured. Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and NEXT_PUBLIC_CLOUDINARY_PRESET_AVATARS (or CLOUDINARY_UPLOAD_PRESET_AVATAR).",
        },
        { status: 400 }
      );
    }

    // Build Cloudinary unsigned upload
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", preset);
    if (folder) fd.append("folder", folder);

    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloud}/upload`;
    const up = await fetch(uploadUrl, { method: "POST", body: fd });
    const uj = (await up.json()) as any;

    if (!up.ok || !uj?.secure_url) {
      return noStore(
        { error: uj?.error?.message || "Cloudinary upload failed" },
        { status: 400 }
      );
    }

    // Save to user profile
    await prisma.user.update({
      where: { id: userId },
      data: { image: uj.secure_url as string },
    });

    return noStore({ url: uj.secure_url });
  } catch (e) {
    console.warn("[avatar upload] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
