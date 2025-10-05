// src/app/api/upload/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { uploadFile } from "@/app/lib/media";
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";

// Add formats here if you decide to support more (e.g., "image/avif", "image/heic")
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10MB

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  // strong no-store and vary on auth/origin so intermediaries don't cross-cache
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding, Origin");
  return res;
}

// --- byte sniffers (best-effort; not a full validator) ---
async function readMagic(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, 16).arrayBuffer());
}

async function sniffLooksLikeImage(file: File): Promise<boolean> {
  try {
    const b = await readMagic(file);
    // JPEG FF D8
    if (b[0] === 0xff && b[1] === 0xd8) return true;
    // PNG 89 50 4E 47
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true;
    // GIF 47 49 46
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return true;
    // WebP "RIFF"
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return true;
    return false;
  } catch {
    return false;
  }
}

async function detectMimeFromBytes(file: File): Promise<string | null> {
  try {
    const b = await readMagic(file);
    if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return "image/webp";
    return null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  // Optional rate limit (best-effort)
  if (typeof checkRateLimit === "function") {
    const rl = await checkRateLimit(req.headers, {
      name: "upload_min",
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.ok) return tooMany("Too many uploads. Please try again shortly.", rl.retryAfterSec);
  }

  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("multipart/form-data")) {
    return noStore({ error: "Content-Type must be multipart/form-data" }, { status: 415 });
  }

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof Blob)) {
    return noStore({ error: "No file provided (field name must be `file`)." }, { status: 400 });
  }

  const f = file as File;
  const declaredMime = f.type || ""; // PowerShell often sends application/octet-stream or empty

  const maxEnv = Number(process.env["UPLOAD_MAX_BYTES"]);
  const max = Number.isFinite(maxEnv) && maxEnv > 0 ? maxEnv : DEFAULT_MAX_BYTES;
  if (f.size > max) {
    return noStore(
      { error: `File too large. Max ${(max / 1024 / 1024).toFixed(1)}MB` },
      { status: 413 }
    );
  }

  // Accept if either:
  //  - declared MIME is allowed, OR
  //  - bytes sniff to a known image (handles octet-stream uploads from PowerShell)
  const looksImage = await sniffLooksLikeImage(f);
  if (!ALLOWED.has(declaredMime) && !looksImage) {
    return noStore({ error: `Unsupported file type (${declaredMime || "unknown"})` }, { status: 415 });
  }

  // Optional hints for where to place the file in your provider
  const folder = String(form.get("folder") || "").trim() || undefined;
  const keyPrefix = String(form.get("keyPrefix") || "").trim() || undefined;

  // Pick best content-type for provider
  const guessedMime = ALLOWED.has(declaredMime) ? declaredMime : (await detectMimeFromBytes(f)) || declaredMime || "application/octet-stream";

  // Upload via our provider-agnostic helper (with clean error handling)
  try {
    const out = await uploadFile(f, {
      ...(folder ? { folder } : {}),
      ...(keyPrefix ? { keyPrefix } : {}),
      contentType: guessedMime,
    });

    // Provide both url and secure_url for client compatibility
    const url =
      (out as any)?.url ||
      (out as any)?.secure_url ||
      (out as any)?.secureUrl ||
      null;

    const secure_url =
      (out as any)?.secure_url ||
      (out as any)?.secureUrl ||
      (out as any)?.url ||
      null;

    if (!url) {
      return noStore({ error: "Upload failed: no URL returned" }, { status: 500 });
    }

    return noStore(
      {
        id: (out as any)?.id || (out as any)?.public_id || null,
        url,
        secure_url,
      },
      { status: 201 }
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[upload POST] error", e);
    return noStore({ error: "Upload failed" }, { status: 500 });
  }
}

export function OPTIONS() {
  const origin =
    process.env["NEXT_PUBLIC_APP_URL"] ??
    process.env["APP_ORIGIN"] ??
    "*";
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS, HEAD");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Vary: "Origin",
    },
  });
}
