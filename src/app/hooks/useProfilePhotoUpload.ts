// src/app/hooks/useProfilePhotoUpload.ts
"use client";

import { useCallback, useRef, useState } from "react";

/* --------------------------------- Types --------------------------------- */

type CloudinaryUploadOk = {
  secure_url: string;
  public_id: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
};

type ApiOk = {
  ok: true;
  user: {
    id: string;
    image: string | null;
    name: string | null;
    username: string | null;
    email: string | null;
  };
  variants?: {
    avatarUrl: string;
    previewUrl: string;
    placeholderUrl: string;
  } | null;
};
type ApiErr = { error: string };

export type UploadOptions = {
  /** Max file size in MB (default 5). */
  maxSizeMB?: number;
  /** Allowed MIME types. Supports wildcards like "image/*". (default allows jpeg/png/webp/avif/gif) */
  allowedTypes?: readonly string[];
  /** Minimum width/height in pixels (default 200). */
  minDimensions?: number;
  /** Optional Cloudinary folder (e.g. 'qwiksale/avatars'). */
  folder?: string;
  /** Optional Cloudinary tags. */
  tags?: string[];
  /** Abort existing upload first (default true). */
  interruptPrevious?: boolean;
  /** Retries for network hiccups (default 2). */
  retries?: number;
};

/* ------------------------------- Utilities -------------------------------- */

const DEFAULT_ALLOWED: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
];

function bytesToMB(n: number) {
  return n / (1024 * 1024);
}

async function readImageDims(file: File): Promise<{ w: number; h: number }> {
  if ("createImageBitmap" in window) {
    const bmp = await createImageBitmap(file);
    const out = { w: bmp.width, h: bmp.height };
    bmp.close?.();
    return out;
  }
  const url = URL.createObjectURL(file);
  try {
    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error("Image decode failed"));
      img.src = url;
    });
    return dims;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function withJitter(ms: number) {
  const j = Math.max(100, Math.floor(ms * 0.15));
  const low = ms - j;
  const high = ms + j;
  return Math.floor(low + Math.random() * (high - low));
}

/** Extract Cloudinary public_id from a secure URL (best-effort). */
function publicIdFromUrl(url: string): string | "" {
  try {
    // Pattern: https://res.cloudinary.com/<cloud>/image/upload/<transforms?>/v123/<public_id>.<ext>
    const u = new URL(url);
    const parts = u.pathname.split("/");
    const uploadIdx = parts.findIndex((p) => p === "upload");
    if (uploadIdx === -1) return "";
    const tail = parts.slice(uploadIdx + 1).filter(Boolean);
    const tailNoVersion = tail[0]?.startsWith("v") ? tail.slice(1) : tail;
    const last = tailNoVersion[tailNoVersion.length - 1] || "";
    if (!last) return "";
    const dot = last.lastIndexOf(".");
    const filename = dot > 0 ? last.slice(0, dot) : last;
    const folders = tailNoVersion.slice(0, -1);
    return [...folders, filename].join("/");
  } catch {
    return "";
  }
}

/** Insert a Cloudinary transform string immediately after `/upload/` in a secure URL. */
function insertCldTransform(url: string, transform: string): string {
  try {
    const idx = url.indexOf("/upload/");
    if (idx === -1) return url;
    const before = url.slice(0, idx + "/upload/".length);
    const after = url.slice(idx + "/upload/".length);
    return `${before}${transform.replace(/^\/+|\/+$/g, "")}/${after}`;
  } catch {
    return url;
  }
}

/** Cloudinary transformation helpers for avatars */
export function cldAvatar(urlOrPublicId: string, size = 256): string {
  // Accept secure_url or public_id
  if (/^https?:\/\//i.test(urlOrPublicId)) {
    return insertCldTransform(
      urlOrPublicId,
      `c_fill,g_face,r_max,w_${size},h_${size},f_auto,q_auto`
    );
  }
  // If only public_id provided, just return as-is (server should render)
  return urlOrPublicId;
}
export function cldBlurPlaceholder(urlOrPublicId: string): string {
  if (/^https?:\/\//i.test(urlOrPublicId)) {
    return insertCldTransform(urlOrPublicId, "e_blur:1000,q_20,w_40");
  }
  return urlOrPublicId;
}

/* ------------------------------- Uploader --------------------------------- */

function uploadViaApi(
  file: File,
  {
    onProgress,
    signal,
  }: {
    onProgress?: (pct: number) => void;
    signal?: AbortSignal;
  }
): Promise<CloudinaryUploadOk> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");

    const onAbort = () => {
      try {
        xhr.abort();
      } catch {}
      reject(new Error("Upload aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) onProgress?.(Math.round((evt.loaded / evt.total) * 100));
    };
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && (json.url || json.secure_url)) {
          const secureUrl: string = String(json.url || json.secure_url);
          resolve({
            secure_url: secureUrl,
            public_id: json.public_id || publicIdFromUrl(secureUrl) || "",
            width: json.width,
            height: json.height,
            format: json.format,
            bytes: json.bytes,
          });
        } else {
          reject(new Error(json?.error || `Upload failed (${xhr.status})`));
        }
      } catch (e: any) {
        reject(new Error(e?.message || "Upload response parse error"));
      } finally {
        signal?.removeEventListener("abort", onAbort);
      }
    };
    xhr.onerror = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("Network error during upload"));
    };

    xhr.send(form);
  });
}

/* --------------------------------- Hook ----------------------------------- */

export function useProfilePhotoUpload() {
  const [progress, setProgress] = useState(0);
  const [isUploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setProgress(0);
    setUploading(false);
    setError(null);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const chooseFile = useCallback(async (accept = "image/*"): Promise<File | null> => {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.click();
    });
  }, []);

  const typeAllowed = (mime: string, allowed: readonly string[]) =>
    allowed.some((t) => (t.endsWith("/*") ? mime.startsWith(t.slice(0, -1)) : mime === t));

  const validateFile = useCallback(
    async (file: File, opts?: UploadOptions) => {
      const maxSize = opts?.maxSizeMB ?? 5;
      if (bytesToMB(file.size) > maxSize) {
        throw new Error(`Image is too large. Max ${maxSize} MB.`);
      }
      const allowed = opts?.allowedTypes ?? DEFAULT_ALLOWED;
      if (!typeAllowed(file.type, allowed)) {
        throw new Error(`Unsupported file type. Allowed: ${allowed.join(", ")}`);
      }
      const minDim = opts?.minDimensions ?? 200;
      const { w, h } = await readImageDims(file);
      if (w < minDim || h < minDim) {
        throw new Error(`Image is too small. Minimum ${minDim}×${minDim}px.`);
      }
    },
    []
  );

  const upload = useCallback(
    async (file: File, opts?: UploadOptions) => {
      setUploading(true);
      setError(null);
      setProgress(0);

      const { interruptPrevious = true, retries = 2 } = opts || {};

      try {
        await validateFile(file, opts);

        if (interruptPrevious) abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        // Upload with small retry loop
        let lastErr: unknown = null;
        let attempt = 0;
        let uploadRes: CloudinaryUploadOk | null = null;

        while (attempt <= retries) {
          try {
            uploadRes = await uploadViaApi(file, {
              onProgress: setProgress,
              signal: controller.signal,
            });
            break;
          } catch (e) {
            lastErr = e;
            if (controller.signal.aborted) throw e;
            if (attempt === retries) throw e;
            await new Promise((r) => setTimeout(r, withJitter(800 * (attempt + 1))));
            attempt++;
          }
        }

        if (!uploadRes) throw lastErr ?? new Error("Upload failed");

        // Persist to API
        const res = await fetch("/api/account/profile/photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ secureUrl: uploadRes.secure_url }),
        });

        const data: ApiOk | ApiErr = await res.json().catch(() => ({ error: "Invalid API response" }));
        if (!res.ok) {
          throw new Error((data as ApiErr)?.error || `API error ${res.status}: profile/photo`);
        }

        // If backend didn’t compute variants, give client-side fallbacks
        if ((data as ApiOk)?.ok && !(data as ApiOk).variants) {
          const source = uploadRes.public_id || uploadRes.secure_url;
          const avatarUrl = cldAvatar(uploadRes.secure_url || source, 256);
          const previewUrl = cldAvatar(uploadRes.secure_url || source, 512);
          const placeholderUrl = cldBlurPlaceholder(uploadRes.secure_url || source);
          (data as ApiOk).variants = { avatarUrl, previewUrl, placeholderUrl };
        }

        return data as ApiOk;
      } catch (e: any) {
        const msg = e?.message || "Upload failed";
        setError(msg);
        throw e;
      } finally {
        setUploading(false);
        setProgress(100);
      }
    },
    [validateFile]
  );

  const remove = useCallback(async () => {
    setUploading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/profile/photo", { method: "DELETE" });
      const data: ApiOk | ApiErr = await res.json().catch(() => ({ error: "Invalid API response" }));
      if (!res.ok) {
        throw new Error((data as ApiErr)?.error || "Failed to remove photo");
      }
      return data as ApiOk;
    } catch (e: any) {
      const msg = e?.message || "Remove failed";
      setError(msg);
      throw e;
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, []);

  return {
    // actions
    upload,          // (file, opts?) => Promise<ApiOk>
    remove,          // () => Promise<ApiOk>
    reset,           // reset progress/error state
    cancel,          // abort in-flight upload
    chooseFile,      // opens native picker → Promise<File|null>

    // state
    isUploading,
    progress,        // 0..100
    error,

    // helpers
    cldAvatar,       // (urlOrPublicId, size?) -> string
    cldBlurPlaceholder,
  };
}
