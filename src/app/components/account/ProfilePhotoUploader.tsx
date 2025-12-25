"use client";
// src/app/components/account/ProfilePhotoUploader.tsx

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProfilePhotoUpload } from "@/app/hooks/useProfilePhotoUpload";

/**
 * Profile photo uploader:
 * - Drag & drop + click/keyboard to pick
 * - Paste-from-clipboard support
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
  allowedTypes = ["image/*", "image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"],
  sizePx = 96,
  shape = "xl",
  className = "",
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const helpId = useRef(`avatar-help-${Math.random().toString(36).slice(2)}`).current;

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

      try {
        // Hook internally handles retries/abort and persisting to API
        const res = await upload(f);
        const { user, variants } = res ?? {};
        setImage(user?.image || null);
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
      // Capture the element, read files, and clear **before** any await
      const input = e.currentTarget;
      const f = input.files?.[0];
      // Always reset to allow picking the same file again
      input.value = "";
      if (!f) return;
      await beginUpload(f);
    },
    [beginUpload]
  );

  const onRemove = useCallback(async () => {
    // Abort any ongoing upload first
    cancel();
    try {
      const res = await remove();
      const { user } = res ?? {};
      setImage(user?.image ?? null); // likely null
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

  // Paste from clipboard (optional nicety)
  const onPaste = useCallback(
    async (e: React.ClipboardEvent<HTMLDivElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f) {
            await beginUpload(f);
            break;
          }
        }
      }
    },
    [beginUpload]
  );

  const px = `${sizePx}px`;

  return (
    <div className={["flex items-start gap-4", className].join(" ")}>
      {/* SR live region */}
      <span ref={liveRef} className="sr-only" aria-live="polite" />

      {/* Preview / Drop zone */}
      <div
        className={[
          "relative overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text)]",
          roundClass,
          dragOver ? "ring-2 ring-focus border-[var(--border)] bg-[var(--bg)]" : "",
          "cursor-pointer outline-none transition",
          "focus-visible:outline-none focus-visible:ring-2 ring-focus",
        ].join(" ")}
        style={{ width: px, height: px }}
        onClick={() => fileInputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onPaste={onPaste}
        role="button"
        aria-label={previewSrc ? "Profile photo" : "No profile photo"}
        aria-describedby={helpId}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        title="Drop an image here, paste, or click/press Enter to pick a file"
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
          <div className="flex h-full w-full items-center justify-center text-xs text-[var(--text-muted)]">
            No photo
          </div>
        )}

        {/* subtle overlay hint on drag */}
        {dragOver && (
          <div className="absolute inset-0 border-2 border-dashed border-[var(--border)] bg-[var(--bg-subtle)] opacity-60" />
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-2xl px-3 py-2 text-sm font-semibold shadow-sm border border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)] transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus disabled:opacity-50"
            disabled={isUploading}
          >
            {isUploading ? "Uploading…" : "Upload photo"}
          </button>

          {image && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-2xl px-3 py-2 text-sm font-semibold shadow-sm border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus disabled:opacity-50"
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
              className="rounded-2xl px-3 py-2 text-sm font-semibold shadow-sm border border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)] transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus disabled:opacity-50"
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
          <div className="text-xs text-[var(--text-muted)]">
            Uploading… {progress ?? 0}%
            <div
              className="mt-1 h-2 w-56 overflow-hidden rounded-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)]"
              role="progressbar"
              aria-valuenow={progress ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Upload progress"
              title={`${progress ?? 0}%`}
            >
              <div
                className="h-full bg-[var(--text)] transition-[width] duration-300 ease-linear"
                style={{ width: `${Math.min(100, Math.max(0, progress || 0))}%` }}
              />
            </div>
          </div>
        )}

        {/* Errors */}
        {(validationError || error) && (
          <div className="text-xs">
            {validationError && (
              <div className="text-[var(--text-muted)]">{validationError}</div>
            )}
            {error && (
              <div className="text-[var(--text)]">
                {error}{" "}
                <button
                  type="button"
                  onClick={() => {
                    reset();
                    setValidationError(null);
                    announce("Error state cleared");
                  }}
                  className="ml-2 underline underline-offset-2 text-[var(--text-muted)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 ring-focus rounded"
                >
                  reset
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tiny help text */}
        <p id={helpId} className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          Accepted: JPG, PNG, WebP, AVIF, GIF. Max {Math.round(maxBytes / 1024 / 1024)}MB.
          Drag & drop and paste supported.
        </p>
      </div>
    </div>
  );
}
