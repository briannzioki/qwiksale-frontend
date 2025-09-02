export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/* never-cache helper */
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

export async function POST(req: NextRequest) {
  // Read envs using the *current* names you configured
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const preset = process.env.NEXT_PUBLIC_CLOUDINARY_PRESET_AVATARS;
  const folder =
    process.env.CLOUDINARY_UPLOAD_FOLDER_AVATARS || "qwiksale/avatars";

  if (!cloud || !preset) {
    return noStore(
      { error: "Cloudinary not configured. Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and NEXT_PUBLIC_CLOUDINARY_PRESET_AVATARS." },
      { status: 500 }
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file") as unknown as File | null;
  if (!file) return noStore({ error: "No file provided" }, { status: 400 });

  // Optional: basic size/type guard (2MB cap)
  if (file.size > 2 * 1024 * 1024)
    return noStore({ error: "Max file size is 2MB" }, { status: 400 });
  if (!file.type.startsWith("image/"))
    return noStore({ error: "Invalid file type" }, { status: 400 });

  const fd = new FormData();
  fd.set("file", file);
  fd.set("upload_preset", preset);
  fd.set("folder", folder);
  // tiny metadata
  fd.set("context", "alt=User avatar|app=QwikSale");

  const url = `https://api.cloudinary.com/v1_1/${cloud}/image/upload`;
  const r = await fetch(url, { method: "POST", body: fd });
  const j = await r.json().catch(() => ({} as any));

  if (!r.ok || !j?.secure_url) {
    const msg =
      j?.error?.message ||
      j?.message ||
      "Cloudinary upload failed (check preset/folder allow-list)";
    return noStore({ error: msg }, { status: 400 });
  }

  // Return a clean URL; you can add eager transformations in the preset
  return noStore({ url: j.secure_url as string });
}
