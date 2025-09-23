// src/app/components/account/ProfilePhotoUploader.tsx
"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProfilePhotoUpload } from "@/app/hooks/useProfilePhotoUpload";

/**
 * Profile photo uploader:
 * - Drag & drop + click/keyboard to pick
 * - Local preview (object URL) while uploading
 * - Progress bar (a11y)
 * - File validation (size/type)
 * - Abort on re-pick & on unmount
 * - Emits lightweight client events
 */

type Props = {
  /** Current image URL (server state) */
  initialImage?: string | null;
  /** Max allowed file size in bytes (default 5MB) */
  maxBytes?: number;
  /** Allowed mime types (supports wildcard like "image/*") */
  allowedTypes?: readonly string[];
  /** Avatar size in px (square) used for preview box (default 96) */
  sizePx?: number;
  /** Roundness: "full" (circle) | "xl" (rounded-2xl) | "md" */
  shape?: "full" | "xl" | "md";
  /** Extra class on container */
  className?: string;
};

function emit(name: string, detail?: unknown) {
  // eslint-disable-next-line no-console
  console.log(`[qs:event] ${name}`, detail);
  if (typeof window !== "undefined" && "CustomEvent" in window) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}
function track(event: string, payload?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.log("[qs:track]", event, payload);
  emit("qs:track", { event, payload });
}

export default function ProfilePhotoUploader({
  initialImage,
  maxBytes = 5 * 1024 * 1024, // 5MB
  allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"],
  sizePx = 96,
  shape = "xl",
  className = "",
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [image, setImage] = useState<string | null>(initialImage ?? null); // server-truthy value
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null); // server generated variant
  const [localPreview, setLocalPreview] = useState<string | null>(null); // object URL while uploading
  const [dragOver, setDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const liveRef = useRef<HTMLSpanElement | null>(null);

  const { upload, remove, isUploading, progress, error, reset, cancel } = useProfilePhotoUpload();

  // Abort any in-flight upload on unmount + cleanup object URL
  useEffect(() => {
    return () => {
      cancel();
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shape → Tailwind class
  const roundClass = useMemo(
    () => (shape === "full" ? "rounded-full" : shape === "md" ? "rounded-md" : "rounded-2xl"),
    [shape]
  );

  const previewSrc = localPreview || avatarUrl || image || null;

  // Use unoptimized rendering for any non-site-local image (blob:, data:, http(s):)
  const unoptimized = useMemo(() => {
    if (!previewSrc) return false;
    return !previewSrc.startsWith("/"); // covers blob:, data:, http(s):
  }, [previewSrc]);

  // Use unoptimized rendering for any non-site-local image (blob:, data:, http(s):)
  const unoptimized = useMemo(() => {
    if (!previewSrc) return false;
    return !previewSrc.startsWith("/"); // covers blob:, data:, http(s):
  }, [previewSrc]);

  // Clean up object URL whenever it changes away
  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  // Helper: announce changes for screen readers
  const announce = useCallback((msg: string) => {
    const el = liveRef.current;
    if (!el) return;
    el.textContent = msg;
    const t = setTimeout(() => {
      el.textContent = "";
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  // Validate file
  const validateFile = (f: File): string | null => {
    if (f.size > maxBytes) {
      return `File is too large. Max ${Math.round(maxBytes / 1024 / 1024)}MB allowed.`;
    }
    if (
      !allowedTypes.some((t) =>
        t.endsWith("/*") ? f.type.startsWith(t.slice(0, -1)) : f.type === t
      )
    ) {
      return `Unsupported file type (${f.type || "unknown"}).`;
    }
    return null;
  };

  const beginUpload = useCallback(
    async (f: File) => {
      // Abort any in-flight upload via hook
      cancel();

      setValidationError(null);

      const vErr = validateFile(f);
      if (vErr) {
        setValidationError(vErr);
        announce(vErr);
        return;
      }

      // Local preview for immediate feedback
      if (localPreview) URL.revokeObjectURL(localPreview);
      const objUrl = URL.createObjectURL(f);
      setLocalPreview(objUrl);

      // Fresh controller for the new upload
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const { user, variants } = await upload(f);
        setImage(user.image || null);
        setAvatarUrl(variants?.avatarUrl ?? null);
        announce("Profile photo updated");
        track("profile_photo_upload", { size: f.size, type: f.type });
        emit("qs:profile:photo:updated", { url: user?.image, avatar: variants?.avatarUrl });
      } catch {
        announce("Upload failed");
      }
    },
    [announce, cancel, localPreview, upload]
  );

  const onPickFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      await beginUpload(f);
      // reset input value to allow picking the same file again
      e.currentTarget.value = "";
    },
    [beginUpload]
  );

  const onRemove = useCallback(async () => {
    // Abort any ongoing upload first
    cancel();
    try {
      const { user } = await remove();
      setImage(user.image ?? null); // likely null
      setAvatarUrl(null);
      if (localPreview) {
        URL.revokeObjectURL(localPreview);
        setLocalPreview(null);
      }
      announce("Profile photo removed");
      track("profile_photo_remove");
      emit("qs:profile:photo:removed");
    } catch {
      announce("Remove failed");
      // hook error already exposed
    }
  }, [announce, cancel, localPreview, remove]);

  // Drag & drop handlers
  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) await beginUpload(f);
    },
    [beginUpload]
  );

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  }, []);
  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const px = `${sizePx}px`;

  return (
    <div className={["flex items-start gap-4", className].join(" ")}>
      {/* SR live region */}
      <span ref={liveRef} className="sr-only" aria-live="polite" />

      {/* Preview / Drop zone */}
      <div
        className={[
          "relative overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700",
          roundClass,
          dragOver ? "ring-2 ring-[#39a0ca]" : "",
          "cursor-pointer",
        ].join(" ")}
        style={{ width: px, height: px }}
        onClick={() => fileInputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        role="button"
        aria-label={previewSrc ? "Profile photo" : "No profile photo"}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        title="Drop an image here, or click/press Enter to pick a file"
      >
        {previewSrc ? (
          <Image
            src={previewSrc}
            alt="Profile photo"
            fill
            sizes={`${sizePx}px`}
            className="object-cover"
            priority
            unoptimized={unoptimized}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-gray-500">
            No photo
          </div>
        )}

        {/* subtle overlay hint on drag */}
        {dragOver && (
          <div className="absolute inset-0 border-2 border-dashed border-[#39a0ca] bg-[#39a0ca]/10" />
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-2xl px-3 py-2 text-sm font-medium shadow-sm ring-1 ring-gray-300 dark:ring-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            disabled={isUploading}
          >
            {isUploading ? "Uploading…" : "Upload photo"}
          </button>

          {image && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-2xl px-3 py-2 text-sm font-medium text-red-600 shadow-sm ring-1 ring-red-300 dark:ring-red-700 bg-white dark:bg-gray-900 hover:bg-red-50/60 dark:hover:bg-red-900/20 disabled:opacity-50"
              disabled={isUploading}
            >
              Remove
            </button>
          )}

          {(localPreview || avatarUrl) && (
            <button
              type="button"
              onClick={() => {
                // Revert to last server image (if any)
                if (localPreview) {
                  URL.revokeObjectURL(localPreview);
                  setLocalPreview(null);
                }
                setAvatarUrl(null);
                setImage(initialImage ?? null);
                reset(); // clear hook error state if any
                announce("Changes discarded");
              }}
              className="rounded-2xl px-3 py-2 text-sm shadow-sm ring-1 ring-gray-300 dark:ring-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
              disabled={isUploading}
              title="Discard local changes"
            >
              Discard
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={allowedTypes.join(",")}
          className="hidden"
          onChange={onPickFile}
        />

        {/* Progress */}
        {isUploading && (
          <div className="text-xs text-gray-700 dark:text-gray-300">
            Uploading… {progress ?? 0}%
            <div
              className="mt-1 h-2 w-56 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
              role="progressbar"
              aria-valuenow={progress ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Upload progress"
              title={`${progress ?? 0}%`}
            >
              <div
                className="h-full bg-gray-600 dark:bg-gray-300 transition-[width] duration-300 ease-linear"
                style={{ width: `${Math.min(100, Math.max(0, progress || 0))}%` }}
              />
            </div>
          </div>
        )}

        {/* Errors */}
        {(validationError || error) && (
          <div className="text-xs">
            {validationError && (
              <div className="text-amber-700 dark:text-amber-400">{validationError}</div>
            )}
            {error && (
              <div className="text-red-600 dark:text-red-400">
                {error}{" "}
                <button
                  type="button"
                  onClick={() => {
                    reset();
                    setValidationError(null);
                    announce("Error state cleared");
                  }}
                  className="ml-2 underline underline-offset-2"
                >
                  reset
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tiny help text */}
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Accepted: JPG, PNG, WebP, AVIF, GIF. Max {Math.round(maxBytes / 1024 / 1024)}MB.
          Drag & drop supported.
        </p>
      </div>
    </div>
  );
}
