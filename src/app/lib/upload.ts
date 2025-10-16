// src/app/lib/upload.ts
/**
 * Minimal uploader abstraction with Cloudinary support.
 *
 * Env (Cloudinary):
 *  - CLOUDINARY_CLOUD_NAME (required)
 *  - CLOUDINARY_UPLOAD_PRESET (recommended for unsigned upload)
 *  - CLOUDINARY_API_KEY (required only for deletions)
 *  - CLOUDINARY_API_SECRET (required only for deletions)
 *
 * Notes:
 *  - This module is safe to import from client code for uploads.
 *  - Deletions are server-only; on the client they no-op (return false).
 */

export type UploadResult = {
  url: string;
  publicId?: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
};

export type UploadOptions = {
  folder?: string;
  filename?: string; // becomes public_id
  tags?: string[]; // optional tags
  signal?: AbortSignal; // optional abort
};

const CLOUD_NAME =
  process.env["CLOUDINARY_CLOUD_NAME"] ||
  process.env["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"];
const UPLOAD_PRESET =
  process.env["CLOUDINARY_UPLOAD_PRESET"] ||
  process.env["NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET"];
const API_KEY = process.env["CLOUDINARY_API_KEY"];
const API_SECRET = process.env["CLOUDINARY_API_SECRET"];

/** Quick check if client uploads are configured. */
export const isCloudinaryConfigured = !!(CLOUD_NAME && UPLOAD_PRESET);

/**
 * Upload a browser File/Blob directly to Cloudinary (unsigned preset).
 * Throws if Cloudinary is not configured.
 */
export async function uploadFromFile(
  file: Blob,
  opts?: UploadOptions
): Promise<UploadResult> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error("Uploader not configured (Cloudinary env missing)");
  }

  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", UPLOAD_PRESET);
  if (opts?.folder) fd.append("folder", opts.folder);
  if (opts?.filename) fd.append("public_id", opts.filename);
  if (opts?.tags?.length) fd.append("tags", opts.tags.join(","));

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUD_NAME)}/upload`,
    { method: "POST", body: fd, signal: opts?.signal ?? null }
  );

  let j: any = null;
  try {
    j = await res.json();
  } catch {
    // leave j as null
  }

  if (!res.ok || !j?.secure_url) {
    const msg =
      j?.error?.message ||
      (typeof j?.message === "string" ? j.message : null) ||
      `Upload failed (${res.status})`;
    throw new Error(msg);
  }

  // Build result WITHOUT writing `undefined` to optional fields
  const out: UploadResult = { url: String(j.secure_url) };

  if (typeof j.public_id === "string" && j.public_id.length > 0) {
    out.publicId = j.public_id;
  }
  if (typeof j.width === "number" && Number.isFinite(j.width)) {
    out.width = j.width;
  }
  if (typeof j.height === "number" && Number.isFinite(j.height)) {
    out.height = j.height;
  }
  if (typeof j.format === "string" && j.format.length > 0) {
    out.format = j.format;
  }
  if (typeof j.bytes === "number" && Number.isFinite(j.bytes)) {
    out.bytes = j.bytes;
  }

  return out;
}

/* -------------------------------- Deletion --------------------------------
   Best-effort deletion using Cloudinary Admin API.
   Requires API key/secret (Basic auth) and should only be invoked server-side.
---------------------------------------------------------------------------- */

function toBasicAuthBase64(user: string, pass: string): string {
  const raw = `${user}:${pass}`;
  // Browser
  if (typeof btoa === "function") {
    try {
      return btoa(raw);
    } catch {
      /* fallthrough */
    }
  }
  // Node/global Buffer without importing node:buffer (keeps bundle client-safe)
  const B: any = (globalThis as any).Buffer;
  if (B?.from) {
    try {
      return B.from(raw, "utf8").toString("base64");
    } catch {
      /* fallthrough */
    }
  }
  return "";
}

/**
 * Best-effort deletion using Cloudinary Admin API.
 * Returns false on the client to avoid credential leakage.
 */
export async function deleteByPublicId(publicId: string): Promise<boolean> {
  if (!publicId) return false;
  // Prevent accidental client-side secrets exposure
  if (typeof window !== "undefined") return false;

  if (!CLOUD_NAME || !API_KEY || !API_SECRET) return false;

  const auth = toBasicAuthBase64(API_KEY, API_SECRET);
  if (!auth) return false;

  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(
    CLOUD_NAME
  )}/resources/image/upload?public_ids[]=${encodeURIComponent(publicId)}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Basic ${auth}` },
  }).catch(() => null as any);

  return !!res?.ok;
}

/**
 * Utility: try to derive a Cloudinary public_id from a secure URL.
 * Works for URLs like:
 *   https://res.cloudinary.com/<cloud>/image/upload/v123/folder/name.jpg
 * Handles leading transformations and version segments.
 */
export function publicIdFromUrl(secureUrl?: string | null): string | null {
  if (!secureUrl) return null;
  try {
    const u = new URL(secureUrl);
    // Expect path: /<cloud>/image/upload/(transformations/)?(v123/)?.../<publicId>.<ext>
    const parts = u.pathname.split("/").filter(Boolean);
    const uploadIdx = parts.findIndex((p) => p === "upload");
    if (uploadIdx < 0) return null;

    let after = parts.slice(uploadIdx + 1); // could start with transformation or version

    // Drop any leading transformation segment (contains ',' or "<word>_")
    const first = after[0] ?? "";
    if (first.includes(",") || /^[a-z]+_/.test(first)) {
      after = after.slice(1);
    }

    // Drop version segment if present
    if (after[0]?.startsWith("v") && /^\d+$/.test(after[0].slice(1))) {
      after = after.slice(1);
    }

    if (!after.length) return null;

    const joined = after.join("/"); // "folder/name.jpg" or "name.jpg"
    const dot = joined.lastIndexOf(".");
    return dot > 0 ? decodeURIComponent(joined.slice(0, dot)) : decodeURIComponent(joined);
  } catch {
    return null;
  }
}

/** Convenience: delete by secure URL or by public_id directly. Server-only. */
export async function deleteByUrlOrPublicId(input: string): Promise<boolean> {
  if (!input) return false;
  const pid = input.startsWith("http") ? publicIdFromUrl(input) : input;
  return pid ? deleteByPublicId(pid) : false;
}
