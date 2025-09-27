// src/app/api/upload/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";

type CloudinaryJSON = {
  secure_url?: string;
  public_id?: string;
  width?: number;
  height?: number;
  format?: string;
  error?: { message?: string };
};

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function env(name: string) {
  return process.env[name] || process.env[`NEXT_PUBLIC_${name}`];
}

function jsonNoStore(data: unknown, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("X-Content-Type-Options", "nosniff");
  return res;
}

function getIP(h: Headers): string {
  const xf = h.get("x-forwarded-for") || h.get("x-vercel-forwarded-for") || "";
  return (xf.split(",")[0]?.trim() || h.get("x-real-ip") || "0.0.0.0");
}

// keep folders simple: letters, numbers, /, -, _, max 60 chars, no leading/trailing slashes, max 3 segments
function sanitizeFolder(input: unknown, fallback = "qwiksale"): string {
  if (typeof input !== "string") return fallback;
  let s = input.trim().replace(/^\/+|\/+$/g, "");
  if (!s) return fallback;
  if (!/^[a-zA-Z0-9/_-]{1,60}$/.test(s)) return fallback;
  const segs = s.split("/");
  if (segs.length > 3) return fallback;
  return s;
}

/** CORS preflight (optional; safe no-op for same-origin) */
export function OPTIONS() {
  const origin =
    process.env["NEXT_PUBLIC_APP_URL"] ??
    process.env["NEXT_PUBLIC_APP_URL"] ??
    "*";
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function POST(req: Request) {
  try {
    // Optional: require auth if you flip the env without code changes
    if (env("UPLOAD_AUTH_REQUIRED") === "1") {
      const session = await auth().catch(() => null);
      if (!session?.user?.id) {
        return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Rate-limit per IP as well
    const rl = await checkRateLimit(req.headers, {
      name: "upload_image",
      limit: 20,
      windowMs: 60_000,
      extraKey: getIP(req.headers),
    });
    if (!rl.ok) {
      return tooMany("Too many uploads. Please try again shortly.", rl.retryAfterSec);
    }

    const ctype = (req.headers.get("content-type") || "").toLowerCase();
    if (!ctype.includes("multipart/form-data")) {
      return jsonNoStore({ error: "Content-Type must be multipart/form-data" }, { status: 415 });
    }

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof Blob)) {
      return jsonNoStore({ error: "No file" }, { status: 400 });
    }

    // Server-side validation (size + mime)
    const maxBytes = Number(env("UPLOAD_MAX_BYTES") || DEFAULT_MAX_BYTES);
    if (file.size > maxBytes) {
      return jsonNoStore(
        { error: `File too large. Max ${(maxBytes / 1024 / 1024).toFixed(1)}MB` },
        { status: 413 }
      );
    }

    const mime = (file as File).type || "";
    if (!ALLOWED_MIME.has(mime)) {
      return jsonNoStore({ error: `Unsupported file type (${mime || "unknown"})` }, { status: 415 });
    }

    const CLOUD_NAME = env("CLOUDINARY_CLOUD_NAME");
    const UNSIGNED_PRESET = env("CLOUDINARY_UPLOAD_PRESET"); // for unsigned uploads
    const API_KEY = env("CLOUDINARY_API_KEY");
    const API_SECRET = env("CLOUDINARY_API_SECRET");
    const BASE_FOLDER = env("CLOUDINARY_UPLOAD_FOLDER") || "qwiksale";
    const requestedFolder = sanitizeFolder(form.get("folder"), BASE_FOLDER);
    const tags = String(form.get("tags") || "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10);

    if (!CLOUD_NAME) {
      return jsonNoStore({ error: "Missing Cloudinary configuration" }, { status: 500 });
    }

    // Choose signed vs unsigned automatically
    const wantSigned = env("CLOUDINARY_SIGNED") === "1" && API_KEY && API_SECRET;

    const out = new FormData();
    out.append("file", file);

    // Common options
    out.append("folder", requestedFolder);
    if (tags.length) out.append("tags", tags.join(","));
    // Nice default: let Cloudinary pick optimal format & quality for delivery on derived assets
    // (You can also generate derived versions later; originals are still kept.)
    out.append("transformation", "f_auto,q_auto");

    let endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

    if (wantSigned) {
      // Signed upload: sign params server-side
      const timestamp = Math.floor(Date.now() / 1000);
      const toSignPairs: string[] = [
        `folder=${requestedFolder}`,
        ...(tags.length ? [`tags=${tags.join(",")}`] : []),
        `timestamp=${timestamp}`,
        "transformation=f_auto,q_auto",
      ];
      // Alphabetical join per Cloudinary signature rules
      const toSign = toSignPairs.sort().join("&") + API_SECRET!;
      // Node 18+ crypto
      const signature = require("crypto").createHash("sha1").update(toSign).digest("hex");

      out.append("timestamp", String(timestamp));
      out.append("api_key", API_KEY!);
      out.append("signature", signature);
      // (No upload_preset needed for signed uploads unless you specifically want to use one.)
    } else {
      // Unsigned upload via preset
      if (!UNSIGNED_PRESET) {
        return jsonNoStore({ error: "Missing unsigned preset (CLOUDINARY_UPLOAD_PRESET)" }, { status: 500 });
      }
      out.append("upload_preset", UNSIGNED_PRESET);
    }

    // Add a server-side timeout so uploads don't hang forever
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30_000); // 30s

    let r: Response;
    try {
      r = await fetch(endpoint, { method: "POST", body: out, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }

    const j = (await r.json().catch(() => null)) as CloudinaryJSON | null;

    if (!r.ok || !j?.secure_url) {
      const msg =
        j?.error?.message ||
        (typeof j === "string" ? j : "") ||
        "Upload failed";
      return jsonNoStore({ error: msg }, { status: 400 });
    }

    // Return a simple, consistent shape
    return jsonNoStore(
      {
        url: j.secure_url,
        publicId: j.public_id,
        width: j.width,
        height: j.height,
        format: j.format,
      },
      { status: 201 }
    );
  } catch (e: any) {
    const aborted = e?.name === "AbortError";
    return jsonNoStore(
      { error: aborted ? "Upload timed out" : e?.message || "Upload failed" },
      { status: aborted ? 504 : 500 }
    );
  }
}
