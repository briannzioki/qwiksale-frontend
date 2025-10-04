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

// Very lightweight magic-number sniff (best-effort; not a full validator)
async function sniffLooksLikeImage(file: File, mime: string) {
  try {
    const buf = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    // JPEG FF D8
    if (mime === "image/jpeg" && buf[0] === 0xff && buf[1] === 0xd8) return true;
    // PNG 89 50 4E 47
    if (mime === "image/png" && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return true;
    }
    // GIF 47 49 46
    if (mime === "image/gif" && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;
    // WebP "RIFF"
    if (mime === "image/webp" && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
      return true;
    }
    // If unknown or short, allow if declared MIME is in ALLOWED (provider may transcode)
    return ALLOWED.has(mime);
  } catch {
    return false;
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

  const mime = (file as File).type || "";
  if (!ALLOWED.has(mime)) {
    return noStore({ error: `Unsupported file type (${mime || "unknown"})` }, { status: 415 });
  }

  const maxEnv = Number(process.env["UPLOAD_MAX_BYTES"]);
  const max = Number.isFinite(maxEnv) && maxEnv > 0 ? maxEnv : DEFAULT_MAX_BYTES;
  if ((file as File).size > max) {
    return noStore(
      { error: `File too large. Max ${(max / 1024 / 1024).toFixed(1)}MB` },
      { status: 413 }
    );
  }

  // Quick magic-number sniff
  const looksOk = await sniffLooksLikeImage(file as File, mime);
  if (!looksOk) {
    return noStore({ error: "File failed basic validation." }, { status: 415 });
  }

  // Optional hints for where to place the file in your provider
  const folder = String(form.get("folder") || "").trim() || undefined;
  const keyPrefix = String(form.get("keyPrefix") || "").trim() || undefined;

  // Upload via our provider-agnostic helper (with clean error handling)
  try {
    const out = await uploadFile(file as File, {
      ...(folder ? { folder } : {}),
      ...(keyPrefix ? { keyPrefix } : {}),
      contentType: mime,
    });

    // Minimal shape as requested
    return noStore({ id: out.id, url: out.url }, { status: 201 });
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
      "Vary": "Origin",
    },
  });
}
