// src/app/api/upload/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { uploadFile } from "@/app/lib/media";
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10MB

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function POST(req: Request) {
  // optional rate limit (best-effort)
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

  const max = Number(process.env["UPLOAD_MAX_BYTES"] || DEFAULT_MAX_BYTES);
  if (file.size > max) {
    return noStore(
      { error: `File too large. Max ${(max / 1024 / 1024).toFixed(1)}MB` },
      { status: 413 }
    );
  }

  // Optional hints for where to place the file in your provider
  const folder = String(form.get("folder") || "").trim() || undefined;
  const keyPrefix = String(form.get("keyPrefix") || "").trim() || undefined;

  // Upload via our provider-agnostic helper
  const out = await uploadFile(file as File, {
    ...(folder ? { folder } : {}),
    ...(keyPrefix ? { keyPrefix } : {}),
    contentType: mime,
  });

  // Minimal shape as requested
  return noStore({ id: out.id, url: out.url }, { status: 201 });
}

export async function HEAD() {
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
