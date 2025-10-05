// src/app/components/media/GalleryUploader.tsx
"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import SmartImage from "@/app/components/SmartImage";

type Props = {
  /** Current gallery (cover is index 0). Absolute URLs or Cloudinary IDs. */
  value: string[];
  /** Called whenever the gallery order/content changes. */
  onChangeAction: (next: string[]) => void | Promise<void>;
  /** When user selects new local files (parent can upload & then merge). */
  onFilesSelectedAction?: (files: File[]) => void | Promise<void>;
  /** Max images allowed (default 10). */
  max?: number;
  className?: string;
  /** Optional label override (default reflects max). */
  label?: string;
  /** If true, allow drag–drop reordering (default true). */
  draggable?: boolean;

  /** Accept string for file input (default: "image/*"; supports ".jpg,.png", etc.) */
  accept?: string;
  /** Max size per file in MB (default: 10) */
  maxSizeMB?: number;
};

function splitAccept(accept: string): string[] {
  return accept
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function isAcceptedByToken(file: File, token: string): boolean {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();

  // Extension like ".jpg"
  if (token.startsWith(".")) return name.endsWith(token);

  // Wildcard like "image/*"
  if (token.endsWith("/*")) {
    const prefix = token.slice(0, -1); // keep trailing slash
    return type.startsWith(prefix);
  }

  // Exact MIME like "image/png"
  return type === token;
}

function isAccepted(file: File, accept: string): boolean {
  // If accept is empty, allow everything
  if (!accept || !accept.trim()) return true;
  const tokens = splitAccept(accept);
  if (tokens.length === 0) return true;
  return tokens.some((t) => isAcceptedByToken(file, t));
}

export default function GalleryUploader({
  value,
  onChangeAction,
  onFilesSelectedAction,
  max = 10,
  className = "",
  label,
  draggable = true,
  accept = "image/*",
  maxSizeMB = 10,
}: Props) {
  // Ensure we never render null/undefined entries
  const images = useMemo(
    () => (Array.isArray(value) ? value.filter(Boolean).map(String) : []),
    [value]
  );

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [liveMsg, setLiveMsg] = useState<string>("");
  const uid = useId();

  const canAddMore = images.length < max;
  const labelText = label ?? `Photos (up to ${max})`;

  // ----- announce helper (SR) -----
  const announce = useCallback((msg: string) => {
    setLiveMsg(msg);
    setTimeout(() => setLiveMsg(""), 1200);
  }, []);

  // ----- mutations -----
  const commit = useCallback(
    (next: string[]) => onChangeAction(next.filter(Boolean).map(String).slice(0, max)),
    [onChangeAction, max]
  );

  const removeAt = useCallback(
    (i: number) => {
      if (i < 0 || i >= images.length) return;
      const next = images.filter((_, idx) => idx !== i);
      void commit(next);
      announce(`Removed photo ${i + 1}`);
    },
    [images, commit, announce]
  );

  const move = useCallback(
    (i: number, dir: -1 | 1) => {
      const j = i + dir;
      if (i < 0 || i >= images.length) return;
      if (j < 0 || j >= images.length) return;
      const next: string[] = [...images];
      const a = next[i]!;
      const b = next[j]!;
      next[i] = b;
      next[j] = a;
      void commit(next);
      announce(`Moved photo ${i + 1} ${dir < 0 ? "left" : "right"}`);
    },
    [images, commit, announce]
  );

  const makeCover = useCallback(
    (i: number) => {
      if (i <= 0 || i >= images.length) return;
      const next: string[] = [...images];
      const picked: string = next[i]!;
      next.splice(i, 1);
      next.unshift(picked);
      void commit(next);
      announce(`Photo ${i + 1} set as cover`);
    },
    [images, commit, announce]
  );

  // ----- drag & drop -----
  const onDragStart = useCallback(
    (i: number) => () => {
      if (!draggable) return;
      setDragIdx(i);
    },
    [draggable]
  );

  const onDragOver = useCallback(
    (i: number) => (e: React.DragEvent) => {
      if (!draggable) return;
      e.preventDefault(); // allow drop
      setDragOverIdx(i);
    },
    [draggable]
  );

  const onDragEnd = useCallback(() => {
    setDragIdx(null);
    setDragOverIdx(null);
  }, []);

  const onDrop = useCallback(
    (i: number) => (e: React.DragEvent) => {
      if (!draggable) return;
      e.preventDefault();
      if (dragIdx == null || i === dragIdx) {
        onDragEnd();
        return;
      }
      // reorder
      const next: string[] = [...images];
      const picked: string = next[dragIdx]!;
      next.splice(dragIdx, 1);
      next.splice(i, 0, picked);
      void commit(next);
      announce(`Moved photo ${dragIdx + 1} to position ${i + 1}`);
      onDragEnd();
    },
    [draggable, dragIdx, images, commit, onDragEnd, announce]
  );

  // ----- file picking -----
  const pickFiles = useCallback(() => inputRef.current?.click(), []);
  const onFiles = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      e.currentTarget.value = ""; // allow same selection later
      setErrorMsg("");

      if (!files.length) return;

      const allowed = Math.max(0, max - images.length);
      if (allowed <= 0) {
        setErrorMsg(`You can upload up to ${max} photos.`);
        return;
      }

      const chosen = files.slice(0, allowed);
      const maxBytes = Math.max(1, maxSizeMB) * 1024 * 1024;

      const bad: string[] = [];
      const ok = chosen.filter((f) => {
        if (!isAccepted(f, accept)) {
          bad.push(`"${f.name}" is not an accepted file type.`);
          return false;
        }
        if (f.size > maxBytes) {
          const mb = (f.size / (1024 * 1024)).toFixed(1);
          bad.push(`"${f.name}" is ${mb}MB (max ${maxSizeMB}MB).`);
          return false;
        }
        return true;
      });

      if (bad.length) setErrorMsg(bad.join(" "));

      if (ok.length === 0) return;

      if (onFilesSelectedAction) {
        try {
          setBusy(true);
          await onFilesSelectedAction(ok);
          announce(ok.length === 1 ? "1 file selected" : `${ok.length} files selected`);
        } finally {
          setBusy(false);
        }
      }
    },
    [images.length, max, onFilesSelectedAction, accept, maxSizeMB, announce]
  );

  // ----- UI -----
  return (
    <div className={["w-full", className].join(" ")} aria-busy={busy ? "true" : "false"}>
      <span className="sr-only" aria-live="polite">
        {liveMsg}
      </span>

      <label className="text-sm font-medium" htmlFor={`gu-files-${uid}`}>
        {labelText}
      </label>

      {images.length > 0 && (
        <ul
          className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
          aria-label="Gallery images"
        >
          {images.map((url, i) => {
            const isOver = dragOverIdx === i;
            return (
              <li
                key={`${url}-${i}`}
                className={[
                  "relative rounded-lg border p-2 transition dark:border-gray-800",
                  isOver ? "ring-2 ring-[#39a0ca]" : "",
                ].join(" ")}
                draggable={draggable}
                onDragStart={onDragStart(i)}
                onDragOver={onDragOver(i)}
                onDragEnd={onDragEnd}
                onDrop={onDrop(i)}
                aria-roledescription="Draggable gallery item"
                aria-grabbed={dragIdx === i}
              >
                <div className="relative h-28 w-full overflow-hidden rounded-md bg-slate-100 dark:bg-slate-900">
                  <SmartImage src={url} alt={`Photo ${i + 1}`} fill className="object-cover" />
                </div>

                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="truncate">{i === 0 ? "Cover" : `#${i + 1}`}</span>

                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="rounded border px-2 py-0.5 dark:border-gray-700"
                      onClick={() => move(i, -1)}
                      title="Move left"
                      disabled={i === 0}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="rounded border px-2 py-0.5 dark:border-gray-700"
                      onClick={() => move(i, +1)}
                      title="Move right"
                      disabled={i === images.length - 1}
                    >
                      →
                    </button>
                    {i !== 0 && (
                      <button
                        type="button"
                        className="rounded border px-2 py-0.5 dark:border-gray-700"
                        onClick={() => makeCover(i)}
                        title="Make cover"
                      >
                        ★
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded border px-2 py-0.5 dark:border-gray-700"
                      onClick={() => removeAt(i)}
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={pickFiles}
          className="rounded-xl px-3 py-2 ring-1 ring-gray-300 hover:bg-gray-50 dark:ring-gray-700 dark:hover:bg-gray-900 disabled:opacity-60"
          disabled={!canAddMore || busy}
        >
          {busy ? "Uploading…" : canAddMore ? "Choose files" : "Max reached"}
        </button>
        <input
          id={`gu-files-${uid}`}
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={onFiles}
        />
        <div className="text-xs text-gray-600 dark:text-gray-400">
          {images.length}/{max} images
        </div>
        {errorMsg && <div className="ml-2 text-xs text-red-600" role="alert">{errorMsg}</div>}
      </div>
    </div>
  );
}
